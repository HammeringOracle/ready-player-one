const fs = require('node:fs');
const {execFile} = require('node:child_process');
// SMB file checks run out of process so an unreachable share cannot hang Node.
function inspect(host) {
  return new Promise(resolve => {
    const script = `const f=require('fs'),p=require('path').win32;const host='\\\\\\\\'+process.argv[1];let error='ENOENT';function exists(file,dir=false){try{const s=f.statSync(file);return dir?s.isDirectory():s.isFile();}catch(e){if(e.code!=='ENOENT')error=e.code;return false;}}
    let result;
    if(exists(p.join(host,'share','system','recalbox.conf'))||exists(p.join(host,'share','recalbox','recalbox.conf')))result={found:true,platform:'recalbox',libraryAccessible:exists(p.join(host,'share','roms'),true)};
    else if(exists(p.join(host,'RetroBat','retrobat.exe')))result={found:true,platform:'retrobat',libraryAccessible:exists(p.join(host,'RetroBat','roms'),true)};
    else if(exists(p.join(host,'Configfiles','retroarch','retroarch.cfg'))&&exists(p.join(host,'Roms'),true))result={found:true,platform:'lakka',libraryAccessible:true};
    else if(exists(p.join(host,'RetroArch','retroarch.exe')))result={found:true,platform:'retroarch',libraryAccessible:exists(p.join(host,'RetroArch','roms'),true)};
    else if(exists(p.join(host,'ROMs','systems.txt')))result={found:true,platform:'esde',libraryAccessible:true};
    else if(exists(p.join(host,'roms'),true)&&exists(p.join(host,'configs'),true))result={found:true,platform:'retropie',libraryAccessible:true};
    else if(exists(p.join(host,'Emu-Station','roms'),true)||exists(p.join(host,'EmuStation','roms'),true))result={found:true,platform:'emustation',libraryAccessible:true};
    console.log(JSON.stringify(result||{found:false,error}));`;
    execFile(process.execPath, ['-e', script, host], {windowsHide:true,timeout:10000}, (error,out) => {
      try {resolve(JSON.parse(out));} catch {resolve({found:false,error:error?.killed?'TIMEOUT':'UNAVAILABLE'});}
    });
  });
}
function createDiscovery({settingsPath, getHosts, arpEntries, isOnLan, portOpen, ping=async()=>false, hostName, inspectHost=inspect, inspectSsh=async()=>null}) {
  let known = {};
  const windowsBeacons = new Map();
  try {known=JSON.parse(fs.readFileSync(settingsPath,'utf8'));} catch {}
  // Known machines must remain visible immediately after RP1 starts. Network
  // verification upgrades these red/offline placeholders in the background;
  // a slow scan must never make established machine cards disappear.
  let statuses=Object.fromEntries(Object.entries(known).map(([id,machine]) => {
    const platform=machine.platform||'retrobat';
    const label={retrobat:'RetroBat',recalbox:'Recalbox',lakka:'Lakka',retroarch:'RetroArch',retropie:'RetroPie',esde:'ES-DE',emustation:'Emu-Station'}[platform]||'EmulationStation';
    return [id,{host:machine.host||'',displayName:machine.displayName||label,platform,identity:platform,suggestedUsername:machine.username||'',access:'',online:false,reachable:false,searching:true,libraryAccessible:false,credentialsRequired:false,libraryStatus:'checking',checks:{ping:false,smb:false,ssh:false},resolvedFrom:`Checking previously identified ${label}`}];
  })), pending=null, last=0;
  function currentStatuses() {
    const result=Object.fromEntries(Object.entries(statuses).filter(([,status])=>status.platform!=='windows'));
    for(const [id, beacon] of windowsBeacons) {
      if(Date.now()-beacon.seenAt>30000) {windowsBeacons.delete(id);continue;}
      result[id]={host:beacon.host,displayName:beacon.name,platform:'windows',identity:'windows',suggestedUsername:beacon.username,access:'beacon',online:true,reachable:true,searching:false,libraryAccessible:false,credentialsRequired:false,libraryStatus:'not-applicable',checks:{beacon:true},resolvedFrom:'Ready Player Two Windows discovery beacon'};
    }
    return result;
  }
  async function scan() {
    const arp=await arpEntries();
    const hosts=[...new Set([...Object.values(known).map(x=>x.host),...arp.map(x=>x.host),...(await getHosts())])].filter(isOnLan);
    const next={};let index=0;
    for (const [id, beacon] of windowsBeacons) {
      if (Date.now()-beacon.seenAt>30000) {windowsBeacons.delete(id);continue;}
      next[id]={host:beacon.host,displayName:beacon.name,platform:'windows',identity:'windows',suggestedUsername:beacon.username,access:'beacon',online:true,reachable:true,searching:false,libraryAccessible:false,credentialsRequired:false,libraryStatus:'not-applicable',checks:{beacon:true},resolvedFrom:'Ready Player Two Windows discovery beacon'};
    }
    async function worker() {
      while(index<hosts.length) {
        const host=hosts[index++];
        const [smb,ssh]=await Promise.all([portOpen(host,445,550),portOpen(host,22,550)]);
        const mac=arp.find(x=>x.host===host)?.mac;
        const matches=Object.entries(known).filter(([,x])=>x.platform!=='windows'&&((mac&&x.mac===mac)||(x.host===host&&(!mac||!x.mac||x.mac===mac))));
        if(!smb&&!ssh) {
          // Known machines remain visible as red/offline tags until the user
          // removes them. Availability must never erase established identity.
          for (const [id,machine] of matches) {
            const platform=machine.platform||'retrobat';
            const label={retrobat:'RetroBat',recalbox:'Recalbox',lakka:'Lakka',retroarch:'RetroArch',retropie:'RetroPie',esde:'ES-DE',emustation:'Emu-Station'}[platform]||'EmulationStation';
            next[id]={host,displayName:machine.displayName||label,platform,identity:platform,suggestedUsername:machine.username||'',access:'',online:false,reachable:false,searching:false,libraryAccessible:false,credentialsRequired:false,libraryStatus:'unavailable',checks:{ping:false,smb:false,ssh:false},resolvedFrom:`Previously identified ${label}; machine is offline`};
          }
          continue;
        }
        const rawName=String(await hostName(host).catch(()=> '') || '');
        const parsedName=rawName.match(/^\s*([^\r\n<>]+?)\s*<(?:00|20)>\s+UNIQUE\b/im)?.[1]?.trim();
        const reportedName=parsedName || (/^[\w .-]{1,63}$/.test(rawName.trim())?rawName.trim():'');
        let check=ssh?await inspectSsh(host).catch(()=>null):null;
        if(!check?.found)check=smb?await inspectHost(host):{found:false,error:'SSH_ONLY'};
        // The standard Lakka NetBIOS identity remains visible when Windows
        // refuses its guest share. Library access is still checked separately.
        if(!check.found&&/^lakka(?:[-_ ]?\d+)?$/i.test(reportedName))check={...check,found:true,platform:'lakka',libraryAccessible:false,advertised:true};
        if(!check.found&&/^recalbox(?:[-_ ]?\d+)?(?:\.lan|\.local)?$/i.test(reportedName))check={...check,found:true,platform:'recalbox',libraryAccessible:false,advertised:true};
        const prior=(check.error==='SSH_ONLY'&&ssh
          ? matches.find(([,x])=>x.platform==='lakka')
          : null) || matches.find(([,x])=>!check.platform||(x.platform||'retrobat')===check.platform);
        // A known machine still answering SMB must not vanish on a slow or
        // unauthenticated share check. Never classify a new PC by port alone.
        // Once a machine has been positively identified (including by RP2),
        // keep its tag whenever its expected network service is reachable.
        // Windows may report UNKNOWN instead of EACCES for a protected SMB
        // share, so an error-code allowlist incorrectly made valid tags vanish.
        const knownReachable = Boolean(prior && (smb || ssh));
        if(!check.found && !knownReachable) continue;
        const platform=check.platform||prior?.[1]?.platform||'retrobat';
        const label={retrobat:'RetroBat',recalbox:'Recalbox',lakka:'Lakka',retroarch:'RetroArch',retropie:'RetroPie',esde:'ES-DE',emustation:'Emu-Station'}[platform]||'EmulationStation';
        const id=prior?.[0] || `${label} (${mac || host})`;
        const advertisedName=reportedName.replace(/\.(?:lan|local)$/i,'');
        const name=check.displayName || parsedName || advertisedName || label;
        known[id]={host,platform,mac:mac||prior?.[1]?.mac||'',displayName:name};
        const confirmedAccess=(check.verifiedSsh&&ssh)||platform==='lakka'&&ssh?'ssh':check.libraryAccessible?'smb':'';
        next[id]={host,displayName:name,platform,identity:platform,suggestedUsername:known[id].username||'',access:confirmedAccess,online:Boolean(confirmedAccess),reachable:true,searching:false,libraryAccessible:Boolean(check.libraryAccessible),credentialsRequired:!check.libraryAccessible&&smb,libraryStatus:check.libraryAccessible?'ready':'unverified',checks:{smb,ssh},resolvedFrom:check.verifiedSsh?`${label} OS verified over SSH`:check.advertised?`${label} network hostname; file access unverified`:check.found?`${label} SMB installation`:platform==='lakka'&&ssh?'Previously verified Lakka; SSH reachable':`Previously verified ${label}; SMB reachable`};
        for(const [oldId,old]of Object.entries(statuses))if(old.host===host&&oldId!==id)delete statuses[oldId];
        statuses={...statuses,[id]:next[id]};
      }
    }
    await Promise.all(Array.from({length:24},worker));
    statuses=next;
    fs.writeFileSync(settingsPath,JSON.stringify(known,null,2));
    last=Date.now();
    return currentStatuses();
  }
  return {
    refresh() {if(!pending&&Date.now()-last>25000) pending=scan().catch(()=>statuses).finally(()=>{pending=null;last=Date.now();});return currentStatuses();},
    async scan() {if(!pending) pending=scan().finally(()=>{pending=null;});return pending;},
    known() { return JSON.parse(JSON.stringify(known)); },
    announceWindows(host, displayName, username) {
      if (!isOnLan(host)) return false;
      const name=String(displayName||'').trim().slice(0,63);
      if (!/^[\w .-]{1,63}$/.test(name)) return false;
      const id=`Windows (${name})`;
      windowsBeacons.set(id,{host,name,username:String(username||'').slice(0,256),seenAt:Date.now()});
      return true;
    },
    announce(host, platform, displayName, username) {
      const labels={retrobat:'RetroBat',retroarch:'RetroArch',esde:'ES-DE',emustation:'Emu-Station'};
      if(!isOnLan(host)||!labels[platform])return false;
      const existing=Object.entries(known).find(([,machine])=>machine.host===host&&machine.platform===platform);
      const id=existing?.[0]||`${labels[platform]} (${host})`;
      known[id]={host,platform,mac:existing?.[1]?.mac||'',displayName:String(displayName||labels[platform]).slice(0,63),username:String(username||existing?.[1]?.username||'').slice(0,256)};
      fs.writeFileSync(settingsPath,JSON.stringify(known,null,2));
      last=0;
      return true;
    },
    remove(id) {
      if (!Object.prototype.hasOwnProperty.call(known,id)) return false;
      delete known[id];
      delete statuses[id];
      fs.writeFileSync(settingsPath,JSON.stringify(known,null,2));
      return true;
    }
  };
}
module.exports={createDiscovery,inspect};
