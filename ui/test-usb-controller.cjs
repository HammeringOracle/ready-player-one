const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { readUsbLibrary } = require('./usb-library');
const { deletionState } = require('./usb-deletions');
const root = path.dirname(__dirname);
const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');

async function testUi() {
  for (const [, attributes, script] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/type=["'](?:application\/ld\+json|application\/json)["']/.test(attributes)) new vm.Script(script);
  }
  assert(!html.includes('id="openUsbController"'), 'The redundant manual USB Controller button must stay removed.');
  assert(!html.includes("querySelector('#openUsbController')"), 'The removed button must not leave a dead event handler.');
  assert.match(source, /async function uploadRomUsb[\s\S]*?installUsbImportScript\(device\)/, 'USB staging must install the library reader automatically while copying.');
  assert.match(source, /function removeRom[\s\S]*?installUsbImportScript\(device\)/, 'USB staging must install the library reader automatically while removing.');
  console.log('PASS: inline JS syntax; manual USB Controller UI removed; useful USB inventory setup remains automatic.');
}

function testLibrary() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'rpo-usb-test-'));
  try {
    fs.mkdirSync(path.join(dir,'ready-player-one'));
    const file = path.join(dir,'ready-player-one/library.json');
    const snapshot = {schemaVersion:1,systems:{psx:[
      {name:'Game.cue',kind:'file'}, {name:'Game.bin',kind:'file'},
      {name:'../escape.cue',kind:'file'}, {name:'images',kind:'folder'},
      {name:'C:\\bad.cue',kind:'file'}, {name:'gamelist.xml',kind:'file'}
    ],ps4:[{name:'Game Folder',kind:'folder'}]}};
    fs.writeFileSync(file,JSON.stringify(snapshot));
    assert.equal(readUsbLibrary(dir).systems.psx.length,4);
    const start=source.indexOf('function listRemoteRomsUsb(');
    const end=source.indexOf('function listRemoteRomsSmb(',start);
    const context=vm.createContext({fs,path,readUsbLibrary,deletionState,
      usbPathForSystem:(_,system)=>path.join(dir,'bw-import','roms',system==='ps1'?'psx':system),
      systemFolders:{ps1:'psx',ps4:'ps4'},localExtensions:{ps1:['.cue','.bin'],ps4:['.ps4']},
      isLibraryMetadataName:name=>['gamelist.xml','theme.xml'].includes(String(name).toLowerCase()),
      hideMameSupportFiles:(_system,names)=>names,
      collapsePs1Sidecars:names=>names,
      collapseRemoteMultiDiscEntries:(_system,names)=>names.map(name=>({name,type:'FILE'})),
      listLocalFilesRecursive:()=>[],musicFolderRows:()=>[]
    });
    vm.runInContext(source.slice(start,end)+';this.list=listRemoteRomsUsb;',context);
    const device={driveRoot:dir,drive:'TEST:',usbMode:'staged'};
    assert.deepEqual(Array.from(context.list(device,'ps1'),row=>row[0]),['Game.bin','Game.cue']);
    assert.deepEqual(Array.from(context.list(device,'ps4'),row=>row[0]),['Game Folder']);
    fs.mkdirSync(path.join(dir,'bw-import/roms/psx'),{recursive:true});
    fs.writeFileSync(path.join(dir,'bw-import/roms/psx/New.cue'),'');
    assert.equal(context.list(device,'ps1').length,3,'Keep newly staged games alongside inventory.');
    snapshot.systems.psx=[];
    fs.writeFileSync(file,JSON.stringify(snapshot));
    assert.deepEqual(Array.from(context.list(device,'ps1'),row=>row[0]),['New.cue'],'Removed games must disappear on refresh.');
    fs.writeFileSync(file,'broken');
    assert.equal(readUsbLibrary(dir),null,'Invalid snapshots should allow the legacy fallback.');
    assert.equal(context.list(device,'ps1').length,1);
    fs.writeFileSync(path.win32.join(dir,'bw-library.tsv'),'psx\tLegacy.cue\tfile\n');
    assert.deepEqual(Array.from(context.list(device,'ps1'),row=>row[0]),['Legacy.cue','New.cue']);
    fs.writeFileSync(file,JSON.stringify(snapshot));
    assert.deepEqual(Array.from(context.list(device,'ps1'),row=>row[0]),['New.cue'],'A newer JSON inventory takes precedence over stale TSV entries.');
    assert.deepEqual(Array.from(context.list({...device,usbMode:'direct'},'ps1'),row=>row[0]),['New.cue'],'A readable userdata partition takes precedence over snapshots.');
    console.log('PASS: USB snapshot reading, PS1/PS4 folders, staged merge, refreshed removals, invalid data, legacy TSV fallback, direct-drive precedence.');
  } finally {
    // This exact temporary test directory was created above; no user files are in it.
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

(async()=>{await testUi();testLibrary();})().catch(error=>{console.error(error);process.exitCode=1;});
