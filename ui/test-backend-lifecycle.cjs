const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {EventEmitter} = require('node:events');
const root = require('node:path').resolve(__dirname, '..');
const source = fs.readFileSync(root+'/ui/start-server.js','utf8');
const hash = crypto.createHash('sha256').update('source').digest('hex');
async function check({owned=false, foreign=false, vanished=false}={}) {
 let killed=false, starts=0, monitor, exited=false;
 const context={__dirname:root+'/ui',console:{log(){},error(){}},setTimeout:fn=>fn(),
   setInterval:fn=>{monitor=fn;return {unref(){}}},
   process:{argv:['node','start',...(owned?['--owned','--parent-pid=123']:[])],platform:'win32',pid:456,
     kill(){if(vanished){const e=Error();e.code='ESRCH';throw e}},exit(){exited=true}},
   require(name){
     if(name==='node:http')return {get(_options,cb){const request=new EventEmitter();request.destroy=()=>{};
       queueMicrotask(()=>{if(killed){request.emit('error',Error());return}const response=new EventEmitter();response.statusCode=200;response.setEncoding=()=>{};cb(response);response.emit('data',JSON.stringify({app:foreign?'other':'ready-player-one',version:'1.0.349',sourceHash:hash}));response.emit('end')});return request}};
     if(name==='node:child_process')return {execFile(command,_args,_options,cb){if(command==='netstat.exe')cb(null,'TCP 127.0.0.1:8789 0.0.0.0:0 LISTENING 789');else{killed=true;cb(null,'')}}};
     if(name==='node:fs')return {readFileSync:()=>Buffer.from('source')};
     if(name==='../package.json')return {version:'1.0.349'};
     if(name==='./server'){starts++;return {}};
     return require(name);
   }};
 vm.runInNewContext(source,context);
 for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));
 if(monitor)monitor();
 return {killed,starts,exited,error:context.process.exitCode};
}
(async()=>{
 assert.deepEqual(await check(),{killed:false,starts:0,exited:false,error:undefined});
 assert.deepEqual(await check({owned:true}),{killed:true,starts:1,exited:false,error:undefined});
 assert.deepEqual(await check({owned:true,vanished:true}),{killed:true,starts:1,exited:true,error:undefined});
 const foreign=await check({owned:true,foreign:true});assert.equal(foreign.killed,false);assert.equal(foreign.starts,0);assert.equal(foreign.error,1);
 console.log('PASS: desktop owns fresh backend; parent exit stops it; foreign services remain untouched.');
})().catch(e=>{console.error(e);process.exitCode=1});
