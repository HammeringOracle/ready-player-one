const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const {createDiscovery}=require('./retrobat-discovery');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recroom-discovery-'));
 let platform='retrobat',available=true,advertise=false;
 const discovery=createDiscovery({settingsPath:path.join(dir,'machines.json'),getHosts:async()=>['192.168.12.6','192.168.12.7'],arpEntries:async()=>[{host:'192.168.12.6',mac:'aa'},{host:'192.168.12.7',mac:'bb'}],isOnLan:()=>true,portOpen:async()=>available,hostName:async h=>advertise?'LAKKA':`PC-${h.endsWith('6')?'ONE':'TWO'}`,inspectHost:async()=>platform?{found:true,platform,libraryAccessible:true}:{found:false,error:'ENOENT'}});
 let result=await discovery.scan();assert.equal(Object.keys(result).length,2);
 assert.ok(Object.values(result).every(x=>x.platform==='retrobat'));
 platform='lakka';result=await discovery.scan();assert.equal(Object.keys(result).length,2);assert.ok(Object.values(result).every(x=>x.platform==='lakka'));
 platform='retroarch';result=await discovery.scan();assert.ok(Object.values(result).every(x=>x.platform==='retroarch'&&x.displayName.startsWith('PC-')));
 for (const expected of ['recalbox','retropie','esde','emustation']) {
  platform=expected;result=await discovery.scan();assert.ok(Object.values(result).every(x=>x.platform===expected&&x.displayName.startsWith('PC-')));
 }
 platform=null;result=await discovery.scan();assert.deepEqual(result,{});
 advertise=true;result=await discovery.scan();assert.ok(Object.values(result).every(x=>x.platform==='lakka'&&!x.libraryAccessible));
 available=false;result=await discovery.scan();assert.equal(Object.keys(result).length,2);assert.ok(Object.values(result).every(x=>x.platform==='lakka'&&!x.online&&x.reachable));
 const retainedPath=path.join(dir,'retained.json');
 fs.writeFileSync(retainedPath,JSON.stringify({'Lakka (aa)':{host:'192.168.12.6',mac:'aa',platform:'lakka',displayName:'Lakka'}}));
 const retained=createDiscovery({settingsPath:retainedPath,getHosts:async()=>[],arpEntries:async()=>[{host:'192.168.12.6',mac:'aa'}],isOnLan:()=>true,portOpen:async()=>false,ping:async()=>true,hostName:async()=>''});
 const retainedStatus=Object.values(await retained.scan())[0];
 assert.equal(retainedStatus.platform,'lakka');assert.equal(retainedStatus.online,false);assert.equal(retainedStatus.reachable,true);
 const sshOnly=createDiscovery({settingsPath:path.join(dir,'ssh.json'),getHosts:async()=>['192.168.12.6'],arpEntries:async()=>[{host:'192.168.12.6',mac:'aa'}],isOnLan:()=>true,portOpen:async(h,p)=>p===22,hostName:async()=>'LAKKA',inspectHost:async()=>{throw Error('SMB must not be required');}});
 const sshStatus=Object.values(await sshOnly.scan());
 assert.equal(sshStatus.length,1);assert.equal(sshStatus[0].platform,'lakka');assert.equal(sshStatus[0].access,'ssh');assert.equal(sshStatus[0].checks.smb,false);
 const verified=createDiscovery({settingsPath:path.join(dir,'verified.json'),getHosts:async()=>['192.168.12.6'],arpEntries:async()=>[],isOnLan:()=>true,portOpen:async(h,p)=>p===22,hostName:async()=>'',inspectSsh:async()=>({found:true,platform:'lakka',verifiedSsh:true,displayName:'Living Room'})});
 assert.equal(Object.values(await verified.scan())[0].displayName,'Living Room');
 console.log('PASS: Batocera-family, Recalbox, RetroPie, ES-DE and Emu-Station discovery profiles');
})().catch(e=>{console.error(e);process.exitCode=1});
