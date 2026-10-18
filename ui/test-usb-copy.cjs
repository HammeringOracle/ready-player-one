const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {copyFileResumableLocal} = require('./usb-copy');
(async()=>{
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'rpo-usb-copy-'));
  try {
    const source = path.join(dir,'source'), target = path.join(dir,'target');
    const data = Buffer.alloc(12*1024*1024+31,0x6b);
    await fs.writeFile(source,data);
    await fs.writeFile(target,data.subarray(0,1024));
    let written=0, ticks=0;
    const timer=setInterval(()=>ticks++,1);
    try {
      await copyFileResumableLocal(source,target,(_,skip,delta)=>written+=delta);
    } finally { clearInterval(timer); }
    assert.equal(written,data.length-1024,'Resume counts only newly written bytes.');
    assert(ticks>0,'Copy must leave the event loop responsive.');
    assert.deepEqual(await fs.readFile(target),data);
    written=0;
    assert((await copyFileResumableLocal(source,target,(_,skip,delta)=>written+=delta)).skipped);
    assert.equal(written,0,'Skipped files contribute no transfer speed.');
    const cancelled=path.join(dir,'cancelled');
    await assert.rejects(copyFileResumableLocal(source,cancelled,sent=>{if(sent>0)throw Error('cancel');}),/cancel/);
    await copyFileResumableLocal(source,cancelled);
    assert.deepEqual(await fs.readFile(cancelled),data,'A cancelled file remains resumable.');
    await fs.writeFile(source,'');
    const empty=path.join(dir,'empty');
    await copyFileResumableLocal(source,empty);
    assert.equal((await fs.stat(empty)).size,0);
    console.log('PASS: responsive async copy, byte accuracy, resume, skip accounting, cancellation and empty files.');
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
