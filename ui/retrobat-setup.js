const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const digest=b=>crypto.createHash('md5').update(b).digest('hex');
const locks=new Map();
async function read(file){try{return await fs.readFile(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
module.exports=function create({cache,ps1,large,xbox,packages=require('./retrobat-packages')}) {
 async function plan(root,only) {
   await fs.access(path.join(root,'retrobat.exe'));
   const specs={ps1:[],ps2:[],ps3:[],xbox:[],wiiu:[]};
   for(const name of new Set(Object.values(ps1)))if(await read(path.join(cache,name))){specs.ps1.push({source:name,target:`bios/${name}`,hashes:Object.keys(ps1)});break;}
   if(!specs.ps1.length)specs.ps1.push({source:'SCPH1001.BIN',target:'bios/SCPH1001.BIN',hashes:Object.keys(ps1)});
   for(const system of ['ps2','ps3'])specs[system].push({source:large[system].fileName,target:`bios/${system==='ps2'?'pcsx2/bios/':''}${large[system].fileName}`,hashes:large[system].acceptedMd5||[large[system].md5]});
   for(const [name,item]of Object.entries(xbox))specs.xbox.push({source:item.fileName||name,target:`bios/${item.fileName||name}`,hashes:[item.md5]});
   specs.wiiu.push({source:'cemu/keys.txt',target:'emulators/cemu/keys.txt',keys:true});
   const systems={},details={};
   for(const [system,files]of Object.entries(specs)) {
     if(only&&only!==system)continue;
     const items=[];
     for(const file of files) {
       const source=await read(path.join(cache,file.source)),dest=await read(path.join(root,file.target));
       const valid=source && (file.keys?keySet(source).size>0:file.hashes.includes(digest(source)));
       const installed=file.keys?Boolean(valid&&dest&&[...keySet(source)].every(k=>keySet(dest).has(k))):Boolean(dest&&file.hashes.includes(digest(dest)));
       items.push({...file,installed,error:installed?'':valid?'':`Missing or invalid cached ${file.source}`});
     }
     systems[system]=items.every(x=>x.installed);
     details[system]={files:items,note:system==='ps3'?'Firmware is staged in bios; complete the RPCS3 firmware prompt on this PC.':''};
     if(system==='xbox'){
       try{const stat=await fs.stat(path.join(root,'saves/xbox/xbox_hdd.qcow2'));details[system].hddInstalled=stat.size>0;}catch(e){if(e.code!=='ENOENT')throw e;details[system].hddInstalled=false;}
       systems[system]&&=details[system].hddInstalled;
     }
   }
   for(const system of ['karaoke','xbox360']) {
     if(only&&only!==system)continue;
     const candidates=system==='karaoke'?['emulators/retroarch/cores/pocketcdg_libretro.dll']:['emulators/xenia/xenia.exe','emulators/xenia-canary/xenia_canary.exe'];
     let present=false;for(const name of candidates){try{present||=(await fs.stat(path.join(root,name))).size>0;}catch(e){if(e.code!=='ENOENT')throw e;}}
     systems[system]=present;
     details[system]={files:[],note:present?'':`Install missing Windows ${system==='karaoke'?'Karaoke core':'Xenia emulator'} from its official project.`};
   }
   return {systems,details};
 }
 function keySet(b){return new Set(b.toString('utf8').split(/\r?\n/).map(x=>x.split('#')[0].trim().toLowerCase()).filter(x=>/^[0-9a-f]{32}$/.test(x)));}
 async function install(root,system) {
   const state=await plan(root,system),info=state.details[system];
   if(!info)throw new Error('No automatic RetroBat setup is available for this system.');
   if(!info.files.length&&!state.systems[system]){
     const copied=await packages.install(cache,root,system);
     if(!(await plan(root,system)).systems[system])throw Error('Windows setup verification failed');
     return {ok:true,copied,note:system==='karaoke'?'Karaoke uses matching .cdg and audio files. RetroBat manages RetroArch on first launch.':''};
   }
   for(const item of info.files)if(item.error)throw new Error(item.error);
   const copied=[];
   for(const item of info.files.filter(x=>!x.installed)){
     const target=path.join(root,item.target),source=await fs.readFile(path.join(cache,item.source));
     const existing=await read(target);
     const data=item.keys&&existing?Buffer.from([...new Set([...existing.toString('utf8').split(/\r?\n/),...source.toString('utf8').split(/\r?\n/)])].join('\n')):source;
     if(item.hashes&&!item.hashes.includes(digest(data)))throw new Error('Cached BIOS changed during setup; retry.');
     await fs.mkdir(path.dirname(target),{recursive:true});
     if(existing)await fs.copyFile(target,`${target}.recroom-backup-${Date.now()}`);
     const tmp=`${target}.recroom-${crypto.randomUUID()}.tmp`;
     try{
       await fs.writeFile(tmp,data,{flag:'wx'});
       if(digest(await fs.readFile(tmp))!==digest(data))throw new Error('Transfer verification failed.');
       await fs.rename(tmp,target);
       if(digest(await fs.readFile(target))!==digest(data))throw new Error('Installed file verification failed.');
     }finally{await fs.unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
     copied.push(item.target);
   }
   if(system==='xbox'&&!info.hddInstalled)copied.push(...await packages.install(cache,root,'xboxhdd'));
   return {ok:true,copied,note:info.note};
 }
 return {plan,install:(root,system)=>{
   const key=path.resolve(root).toLowerCase(),previous=locks.get(key)||Promise.resolve();
   const task=previous.catch(()=>{}).then(()=>install(root,system));locks.set(key,task);
   return task.finally(()=>{if(locks.get(key)===task)locks.delete(key);});
 }};
};
