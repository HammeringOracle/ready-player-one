const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {queueDeletion,cancelDeletion,deletionState,readQueue,stageController}=require('./usb-deletions');
const {readUsbLibrary}=require('./usb-library');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rpo-usb-deletions-'));
const boot=path.join(root,'boot'),userdata=path.join(root,'userdata'),wii=path.join(userdata,'roms','wii');
function runWorker() {
  execFileSync('python',['-B','-c',
    'import importlib.util,sys; from pathlib import Path; spec=importlib.util.spec_from_file_location("controller",sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); m.update(Path(sys.argv[2]),Path(sys.argv[3]))',
    path.join(__dirname,'usb-controller.py'),path.join(boot,'ready-player-one'),userdata],{stdio:'pipe'});
}
try {
  fs.mkdirSync(boot,{recursive:true});fs.mkdirSync(wii,{recursive:true});
  fs.writeFileSync(path.join(wii,'Game.wbfs'),'test game');
  fs.writeFileSync(path.join(wii,'Keep.wbfs'),'keep this game');
  fs.writeFileSync(path.join(wii,'gamelist.xml'),'<gameList><game><path>./Game.wbfs</path><name>Game</name></game><game><path>./Keep.wbfs</path><name>Keep</name></game></gameList>');
  fs.writeFileSync(path.join(boot,'postshare.sh'),'#!/bin/bash\necho custom-before\n# BATOCERA WAREHOUSE USB V2\necho legacy\nexit 0\necho custom-after\n');
  stageController(boot);stageController(boot);
  const hook=fs.readFileSync(path.join(boot,'postshare.sh'),'utf8');
  assert.equal(hook.split('# READY PLAYER ONE USB BOOT V3 BEGIN').length,2);
  assert(hook.includes('echo custom-before')&&hook.includes('echo custom-after'));
  assert(!hook.includes('echo legacy'));
  runWorker();
  queueDeletion(boot,'wii','Game.wbfs');queueDeletion(boot,'wii','Game.wbfs');
  assert.equal(readQueue(boot).length,1);
  assert(deletionState(boot,'wii').hides('Game.wbfs'));
  assert(!deletionState(boot,'wii').hides('Keep.wbfs'));
  runWorker();
  assert(!fs.existsSync(path.join(wii,'Game.wbfs')));
  assert(fs.existsSync(path.join(wii,'Keep.wbfs')));
  assert(!fs.readFileSync(path.join(wii,'gamelist.xml'),'utf8').includes('Game.wbfs'));
  assert(fs.readFileSync(path.join(wii,'gamelist.xml'),'utf8').includes('Keep.wbfs'));
  assert.deepEqual(readQueue(boot),[]);
  assert.deepEqual(readUsbLibrary(boot).systems.wii.map(e=>e.name),['Keep.wbfs']);
  assert(readUsbLibrary(boot).storage.totalKb>0);
  fs.writeFileSync(path.join(wii,'Game.wbfs'),'new copy');runWorker();
  assert(fs.existsSync(path.join(wii,'Game.wbfs')),'Acknowledged deletions must not replay against new copies.');
  queueDeletion(boot,'wii','Game.wbfs');cancelDeletion(boot,'wii','Game.wbfs');runWorker();
  assert(fs.existsSync(path.join(wii,'Game.wbfs')));
  for(const name of ['', '..', '../Game.wbfs', 'folder/../../bad', '/Game.wbfs', 'C:\\Game.wbfs']) assert.throws(()=>queueDeletion(boot,'wii',name));
  fs.writeFileSync(path.join(root,'outside'),'protected');
  const queue=path.join(boot,'ready-player-one','delete-queue.json');
  fs.writeFileSync(queue,JSON.stringify({schemaVersion:1,operations:[{id:'invalid',action:'delete',system:'wii',name:'../../../outside'}]}));
  runWorker();
  assert(fs.existsSync(path.join(root,'outside')));
  assert(JSON.parse(fs.readFileSync(queue,'utf8')).operations[0].error);
  fs.writeFileSync(queue,JSON.stringify({schemaVersion:1,operations:[]}));
  fs.mkdirSync(path.join(wii,'FolderGame','content'),{recursive:true});
  fs.writeFileSync(path.join(wii,'FolderGame','content','data'),'folder game');
  queueDeletion(boot,'wii','FolderGame');runWorker();assert(!fs.existsSync(path.join(wii,'FolderGame')));
  queueDeletion(boot,'wii','Already missing.wbfs');runWorker();assert.equal(readQueue(boot).length,0);
  console.log('PASS: persisted queue → actual file/folder removal → gamelist cleanup → refreshed inventory/space → acknowledgement.');
  console.log('PASS: deduplication, cancel/re-add, missing files, path traversal rejection and preservation of custom boot hooks.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
