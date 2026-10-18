const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
module.exports = function createKeypad({getRuntimeDevice, execSsh, stageRemote, root}) {
  const volumeAction=require('./volume')({getRuntimeDevice,execSsh});
  const profiles = new Map();
  const busy = new Set();
  const savedPath=path.join(root,'keypad-layouts.json');
  const profileDir=path.join(root,'Layouts','Remapper Profiles');
  const devicesPath=path.join(root,'remapper-devices.json');
  const readSaved=()=>fs.existsSync(savedPath)?JSON.parse(fs.readFileSync(savedPath,'utf8')):{};
  const allowed = new Set(['exit','f7','escape','menu','pause','reset','save_state','restore_state','fastforward','rewind','screenshot','volumeup','volumedown','volumemute','next_slot','previous_slot']);
  for(const group of ['music','game'])for(const op of ['up','down','mute'])allowed.add(group+'_'+op);
  const isAllowed=action=>allowed.has(action)||/^key:KEY_[A-Z0-9_]{1,24}$/.test(action);
  function writeSaved(saved){const temp=savedPath+'.tmp';fs.writeFileSync(temp,JSON.stringify(saved,null,2));fs.renameSync(temp,savedPath);}
  function restore(entries){
    return entries.map(entry=>{
      if(!entry.codes?.length)return {...entry,token:null};
      const token=crypto.randomUUID();profiles.set(token,{...entry,created:Date.now()});
      return {...entry,token};
    });
  }
  const script = fs.readFileSync(path.join(__dirname,'keypad.py'),'utf8');
  const bridge = zlib.deflateSync(fs.readFileSync(path.join(__dirname,'keypad-bridge.py'))).toString('base64');
  return async function keypad(body,abortSignal) {
    if(body.action==='devices')return {ok:true,devices:fs.existsSync(devicesPath)?JSON.parse(fs.readFileSync(devicesPath,'utf8')):[]};
    if(String(body.action).startsWith('volume-'))return volumeAction(body);
    if (!['save','load','learn','discover','apply','profile-save','profile-list','profile-load'].includes(body.action) || typeof body.device !== 'string') throw Error('Choose a Batocera machine and a keypad action.');
    const model=body.deviceType==='ps4'?'ps4':'6d7f:dcfe';
    const slotCount=model==='ps4'?18:15;
    if(body.action==='profile-list'){
      fs.mkdirSync(profileDir,{recursive:true});
      const savedProfiles=fs.readdirSync(profileDir,{withFileTypes:true}).filter(entry=>entry.isFile()&&entry.name.toLowerCase().endsWith('.json')).flatMap(entry=>{
        try{
          const value=JSON.parse(fs.readFileSync(path.join(profileDir,entry.name),'utf8'));
          return value?.kind==='ready-player-one-remapper-profile'&&value.deviceModel===model&&Array.isArray(value.mappings)
            ? [{fileName:entry.name,name:String(value.name||path.basename(entry.name,'.json')),savedAt:value.savedAt||''}] : [];
        }catch{return [];}
      }).sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true}));
      return {ok:true,profiles:savedProfiles,folder:profileDir};
    }
    if(body.action==='profile-load'){
      const fileName=path.basename(String(body.fileName||''));
      if(!fileName||!fileName.toLowerCase().endsWith('.json'))throw Error('Choose a remapper profile.');
      const filePath=path.join(profileDir,fileName);
      if(!fs.existsSync(filePath))throw Error('That remapper profile no longer exists.');
      const value=JSON.parse(fs.readFileSync(filePath,'utf8'));
      if(value?.kind!=='ready-player-one-remapper-profile'||value.deviceModel!==model||!Array.isArray(value.mappings))throw Error('This profile is not compatible with the selected remapping device.');
      if(value.mappings.length!==slotCount)throw Error('This profile has an invalid button count.');
      return {ok:true,name:String(value.name||path.basename(fileName,'.json')),mappings:restore(value.mappings)};
    }
    const installationKey = typeof body.installationId === 'string' && body.installationId.trim()
      ? body.installationId.trim().slice(0, 240) : body.device;
    if(body.action==='load'){
      const saved=readSaved()[installationKey]?.[model];
      if(saved)return {ok:true,mappings:restore(saved.draft||saved.mappings),appliedMappings:saved.mappings,saved:true,draft:!!saved.draft};
    }
    if(body.action==='save'||body.action==='profile-save'){
      if(!Array.isArray(body.slots)||body.slots.length!==slotCount)throw Error('Invalid keypad layout.');
      const draft=body.slots.map((entry,slot)=>{
        if(entry.action&&!isAllowed(entry.action))throw Error('Unknown hotkey action.');
        const profile=entry.token?profiles.get(entry.token):null;
        if(entry.token&&!profile)throw Error('Reopen the keypad editor to restore its saved signals.');
        return {slot,action:entry.action||'',...(profile?{name:profile.name,key:profile.key,codes:profile.codes,...(['rel','abs'].includes(profile.eventType)?{eventType:profile.eventType,direction:profile.direction}:{})}:{})};
      });
      if(body.action==='profile-save'){
        const requested=String(body.profileName||'Remapper Profile').trim();
        const safeName=(requested.replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim()||'Remapper Profile').slice(0,80);
        fs.mkdirSync(profileDir,{recursive:true});
        let filePath=path.join(profileDir,`${safeName}.json`),suffix=2;
        while(fs.existsSync(filePath))filePath=path.join(profileDir,`${safeName} ${suffix++}.json`);
        fs.writeFileSync(filePath,JSON.stringify({kind:'ready-player-one-remapper-profile',version:1,name:safeName,deviceModel:model,mappings:draft,savedAt:new Date().toISOString()},null,2)+'\n');
        return {ok:true,filePath,name:safeName};
      }
      const saved=readSaved();
      saved[installationKey]={...(saved[installationKey]||{}),[model]:{...(saved[installationKey]?.[model]||{mappings:[]}),draft}};
      writeSaved(saved);return {ok:true};
    }
    const device = await getRuntimeDevice(body.device);
    if(abortSignal?.aborted)throw Error('Button detection cancelled.');
    if (!device || device.access !== 'ssh' || (device.platform && device.platform !== 'batocera')) throw Error('Choose a connected Batocera with SSH credentials.');
    if(busy.has(device.host)) throw Error('A keypad operation is already running on this machine.');
    let mappings=[];
    if(body.action==='apply'){
      if(!Array.isArray(body.mappings)||(!body.mappings.length&&body.replaceLayout!==true)||body.mappings.length>slotCount)throw Error('Assign and learn at least one control before applying.');
      mappings=body.mappings.map((entry,index)=>{
        const profile=profiles.get(entry.token);
        if(!profile||Date.now()-profile.created>3600000)throw Error('Learn each assigned button again before applying.');
        if(!isAllowed(entry.action))throw Error('Unknown hotkey action.');
        if(!Array.isArray(profile.codes)||!profile.codes.length)throw Error('Identify this button again to capture its full shortcut.');
        const slot=entry.slot??index;
        if(!Number.isInteger(slot)||slot<0||slot>=slotCount)throw Error('Invalid keypad position.');
        return {slot,key:profile.key,codes:profile.codes,name:profile.name,action:entry.action,...(['rel','abs'].includes(profile.eventType)?{eventType:profile.eventType,direction:profile.direction}:{})};
      });
      const inputActions=new Map();
      for(const mapping of mappings){
        const input=JSON.stringify([mapping.name,mapping.eventType||'key',[...mapping.codes].sort((a,b)=>a-b),mapping.direction||0]);
        if(inputActions.has(input)&&inputActions.get(input)!==mapping.action)throw Error('Not installed: different functions are assigned to the same detected input. Your edits are kept; you can continue editing.');
        inputActions.set(input,mapping.action);
      }
      if(new Set(mappings.map(m=>m.slot)).size!==mappings.length)throw Error('Two assignments use the same keypad position.');
    }
    const selectedBridge=model==='ps4'?zlib.deflateSync(Buffer.from(zlib.inflateSync(Buffer.from(bridge,'base64')).toString().replaceAll('recroom-keypad','recroom-ps4').replace('(0x6d7f,0xdcfe)', '(0x054c,device.info.product)').replace("device.name not in by_name", "device.info.product not in (0x05c4,0x09cc,0x0ba0) or device.name not in by_name"))).toString('base64'):bridge;
    const input = {action:body.action, deviceType:body.deviceType==='ps4'?'ps4':'keypad', mappings, ...(body.action==='apply'?{bridge:selectedBridge,replaceLayout:body.replaceLayout===true}:{})};
    const encoded = zlib.deflateSync(Buffer.from(JSON.stringify(input))).toString('base64');
    const remoteScript=model==='ps4'?script.replaceAll('recroom-keypad','recroom-ps4').replaceAll('recroom_keypad','recroom_ps4'):script;
    const code = zlib.deflateSync(Buffer.from(remoteScript)).toString('base64');
    // Only fixed Python and base64 data enter the remote shell; never credentials or raw user input.
    let command = `exec python3 -c 'import base64,zlib,sys;sys.argv=["keypad",zlib.decompress(base64.b64decode("${encoded}")).decode()];exec(zlib.decompress(base64.b64decode("${code}")))'`;
    if(body.action==='apply' && stageRemote){
      // The complete bridge makes the inline SSH command too large for some
      // Batocera Dropbear builds. Stage both files over SFTP, then execute a
      // short command that cannot hit the server's command-length limit.
      const stagedScript=remoteScript.replace("request = json.loads(sys.argv[1])", "request = json.loads(Path(sys.argv[1]).read_text())");
      const staged=await stageRemote(device,Buffer.from(stagedScript),Buffer.from(JSON.stringify(input)));
      command=`exec python3 ${staged.script} ${staged.request}`;
    }
    busy.add(device.host);
    try {
      const result = JSON.parse((await execSsh(device,command,22000,['learn','discover'].includes(body.action)?abortSignal:undefined)).trim());
      if(body.action==='discover'){
        if(result.waiting)return {ok:true,waiting:true};
        const devices=fs.existsSync(devicesPath)?JSON.parse(fs.readFileSync(devicesPath,'utf8')):[];
        const entry={id:result.id,name:result.name,vendor:result.vendor,product:result.product};
        const index=devices.findIndex(item=>item.id===entry.id);
        if(index<0)devices.push(entry);else devices[index]=entry;
        fs.writeFileSync(devicesPath+'.tmp',JSON.stringify(devices,null,2));fs.renameSync(devicesPath+'.tmp',devicesPath);
        return {ok:true,...entry};
      }
      if(body.action==='load')return {ok:true,mappings:restore(result.mappings||[]),imported:!!result.mappings?.length};
      if(body.action === 'learn') {
        if(result.waiting)return {ok:true,waiting:true};
        for(const [key,value] of profiles) if(Date.now()-value.created>3600000) profiles.delete(key);
        const token=crypto.randomUUID();
        profiles.set(token,{...result,created:Date.now()});
        return {ok:true,...result,token};
      }
      if(result.installed){
        const saved=readSaved();
        saved[installationKey]={...(saved[installationKey]||{}),[model]:{mappings,updatedAt:new Date().toISOString()}};
        writeSaved(saved);
      }
      return {ok:true,...result};
    } catch(error) {
      const message=String(error.message||error);
      throw Error(message.includes('Traceback (most recent call last):') ? message.trim().split('\n').at(-1).replace(/^\w+(?:Error|Exception)?:\s*/, '') : message);
    } finally {busy.delete(device.host);}
  };
};
