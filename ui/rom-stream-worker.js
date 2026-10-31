const {parentPort, workerData:d} = require('node:worker_threads');
const fs = require('node:fs');
const {Client} = require('ssh2');
const client = new Client();
let source, settled=false, timer;
function finish(error) {
  if(settled)return;
  settled=true;clearTimeout(timer);source?.destroy();client.destroy();
  parentPort.postMessage(error ? {error:error.message} : {done:true});
  parentPort.close();
}
function arm(){clearTimeout(timer);timer=setTimeout(()=>finish(new Error('ROM worker made no progress for 60 seconds.')),60000);}
const q=s=>"'"+String(s).replace(/'/g,"'\\''")+"'";
client.on('error',finish).on('ready',()=>{
  const target=q(d.remotePath);
  const command=d.offset
    ? 'truncate -s '+d.offset+' '+target+' && head -c '+(d.totalSize-d.offset)+' >> '+target
    : 'head -c '+d.totalSize+' > '+target;
  client.exec(command,(error,channel)=>{
    if(error)return finish(error);
    let sent=d.offset,lastReport=0,stderr='';
    source=fs.createReadStream(d.localPath,{start:d.offset,end:d.totalSize-1,highWaterMark:256*1024});
    source.on('error',finish);
    channel.on('error',finish);
    channel.resume();
    channel.stderr.on('data',data=>{stderr=(stderr+data).slice(-1000);});
    source.on('data',chunk=>{
      sent+=chunk.length;arm();
      if(Date.now()-lastReport>150||sent===d.totalSize){
        lastReport=Date.now();parentPort.postMessage({bytes:sent});
      }
    });
    channel.on('close',code=>finish(code===0&&sent===d.totalSize?null:new Error(stderr||'ROM stream closed before completion.')));
    arm();source.pipe(channel);
  });
}).connect({...d.connection,readyTimeout:30000,keepaliveInterval:10000});
arm();
