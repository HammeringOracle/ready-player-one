// Only freely distributed upstream Windows packages. Never download console keys/BIOS.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {promisify}=require('node:util'),execFile=promisify(require('node:child_process').execFile);
const packages={
 karaoke:{url:'https://buildbot.libretro.com/nightly/windows/x86_64/latest/pocketcdg_libretro.dll.zip',file:'pocketcdg_libretro.dll',target:'emulators/retroarch/cores'},
 xbox360:{url:'https://github.com/xenia-project/release-builds-windows/releases/download/v1.0.2844-master/xenia_master.zip',file:'xenia.exe',target:'emulators/xenia'},
 xboxhdd:{url:'https://github.com/xemu-project/xemu-dashboard/releases/latest/download/xbox_hdd.qcow2',file:'xbox_hdd.qcow2',target:'saves/xbox',raw:true}
};
const inflight=new Map();
async function prepare(cache,id){
 const spec=packages[id];if(!spec)throw Error('Unknown Windows package');
 const key=path.resolve(cache)+'/'+id;if(inflight.has(key))return inflight.get(key);
 const task=(async()=>{
   const base=path.join(cache,'windows-packages');await fs.mkdir(base,{recursive:true});
   const dir=await fs.mkdtemp(path.join(base,id+'-'));
   const response=await fetch(spec.url,{signal:AbortSignal.timeout(120000)});
   if(!response.ok)throw Error(`Could not download ${id}: HTTP ${response.status}`);
   const archive=path.join(dir,spec.raw?spec.file:'package.zip');
   const handle=await fs.open(archive,'wx');let size=0;
   try{for await(const chunk of response.body){size+=chunk.length;if(size>512*1024*1024)throw Error('Download exceeds size limit');await handle.write(chunk);}}finally{await handle.close();}
   if(!size)throw Error('Empty package download');
   const extracted=spec.raw?dir:path.join(dir,'files');
   if(!spec.raw)await execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'retrobat-unzip.ps1'),archive,extracted],{windowsHide:true,timeout:120000});
   const bytes=await fs.readFile(path.join(extracted,spec.file));
   if(spec.raw?bytes.subarray(0,4).toString('hex')!=='514649fb':bytes.subarray(0,2).toString()!=='MZ')throw Error('Downloaded package has an invalid file format');
   return {spec,dir:extracted};
 })();inflight.set(key,task);try{return await task;}catch(e){inflight.delete(key);throw e;}
}
async function install(cache,root,id){
 const {spec,dir}=await prepare(cache,id),copied=[];
 async function walk(folder,relative=''){
   for(const entry of await fs.readdir(folder,{withFileTypes:true})){
     if(entry.isSymbolicLink())throw Error('Package links are not allowed');
     const rel=path.join(relative,entry.name),source=path.join(folder,entry.name);
     if(entry.isDirectory()){await walk(source,rel);continue;}
     if(id==='karaoke'&&rel!==spec.file)continue;
     const target=path.join(root,spec.target,rel);
     await fs.mkdir(path.dirname(target),{recursive:true});
     // Existing configurations and saved disks must never be replaced.
     try{await fs.access(target);continue;}catch(e){if(e.code!=='ENOENT')throw e;}
     const tmp=target+'.recroom-'+crypto.randomUUID()+'.tmp';
     await fs.copyFile(source,tmp,1);
     const hash=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
     if(await hash(source)!==await hash(tmp))throw Error('Windows package transfer verification failed');
     try{await fs.copyFile(tmp,target,1);copied.push(path.join(spec.target,rel));}catch(e){if(e.code!=='EEXIST')throw e;}finally{await fs.unlink(tmp);}
   }
 }
 await walk(dir);return copied;
}
module.exports={install,prepare};
