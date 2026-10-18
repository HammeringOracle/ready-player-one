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
  const live = process.argv.includes('--live');
  const origin = live ? 'http://localhost:8789/' : 'http://localhost:8790/';
  if (live) {
    const health = await (await fetch(new URL('/api/health',origin))).json();
    assert(health.capabilities.includes('usb-controller-v1'));
    const served = await (await fetch(origin)).text();
    assert.equal(served,html,'The running server must serve the updated page.');
  }
  for (const [, attributes, script] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/type=["'](?:application\/ld\+json|application\/json)["']/.test(attributes)) new vm.Script(script);
  }
  const apiBase = html.match(/const apiBase = [^;]+;/)[0];
  const start = html.indexOf("document.querySelector('#openUsbController').addEventListener");
  const end = html.indexOf('openControllers.addEventListener', start);
  let callback;
  const calls = [], dialogs = [], button = {disabled:false};
  const context = vm.createContext({
    document:{querySelector:()=>({addEventListener:(_,fn)=>{callback=fn;}})},
    closeAdvancedMenu:()=>{}, chooseSupportedBatoceraMachines:async()=>['Batocera'],
    machineDisplayName:name=>name, syncStatus:{},
    showXboxBiosDialog:async options=>{dialogs.push(options); return true;},
    fetch:async (url, options)=>{
      calls.push({url:new URL(url, origin).href, body:JSON.parse(options.body)});
      if (live) return fetch(new URL(url,origin),options);
      return {status:200,ok:true,json:async()=>({ok:true,installed:true,path:'/boot/ready-player-one/library.json'})};
    }
  });
  vm.runInContext(apiBase + html.slice(start,end), context);
  await callback({currentTarget:button});
  assert.equal(calls[0].url,new URL('/api/usb-controller/install',origin).href,'Must use the page origin, not an old hard-coded port.');
  assert.equal(calls[0].body.device,'Batocera');
  assert.match(dialogs.at(-1).message,/Installed/);
  if (live) console.log('PASS: actual USB Controller UI handler → current backend → BATOCERA → verified running service and fresh JSON.');
  assert.equal(button.disabled,false);
  context.fetch=async()=>({status:405,ok:false});
  await callback({currentTarget:button});
  assert.match(dialogs.at(-1).message,/background server is outdated/);
  assert.equal(button.disabled,false);
  console.log('PASS: inline JS syntax; UI uses same-origin API; success and stale-server messages.');
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
      systemFolders:{ps1:'psx',ps4:'ps4'},localExtensions:{ps1:['.cue','.bin'],ps4:['.ps4']}
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
