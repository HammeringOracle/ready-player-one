(() => {
  const style=document.createElement('style');style.textContent=`
    #volumeDialog{box-sizing:border-box;width:min(480px,94vw);max-height:90vh;overflow:auto;border:1px solid #65748b;border-radius:20px;padding:22px;background:var(--panel,#1c2028);color:var(--text,#f0f3fa)}
    #volumeDialog::backdrop{background:#0009} #volumeDialog header,#volumeDialog footer{display:flex;justify-content:space-between;align-items:center;gap:12px}
    #volumeDialog h2{margin:0;font-size:24px} #volumeDialog p,#volumeDialog label{font-size:14px;line-height:1.5}
    #volumeDialog .vu-explanation{margin:14px 0 12px;padding-left:22px;font-size:14px;line-height:1.55}
    #volumeDialog .vu-explanation li+li{margin-top:8px}
    #volumeDialog .music-path{display:inline-block;padding:1px 6px;border-radius:5px;color:#ffd66b;background:rgba(224,171,48,.13);font-weight:800;text-shadow:0 0 8px rgba(255,196,65,.18)}
    #volumeDialog .vu-machines{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}
    #volumeDialog button.vu-machine{box-sizing:border-box;width:180px;height:54px;display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center;gap:8px;position:relative;padding:5px 24px 5px 9px;text-align:left;font:inherit;color:var(--text,#f0f3fa);border:1px solid rgba(255,255,255,.18);border-radius:12px;background:linear-gradient(135deg,rgba(38,168,255,.18),transparent 54%),linear-gradient(180deg,rgba(34,44,58,.96),rgba(10,15,22,.96));box-shadow:none;opacity:.76}
    #volumeDialog button.vu-machine.selected{border-color:rgba(38,168,255,.88);box-shadow:0 0 0 4px rgba(38,168,255,.25),0 0 34px rgba(38,168,255,.42);opacity:1}
    #volumeDialog .vu-machine::after{content:"";position:absolute;top:7px;right:8px;width:10px;height:10px;border-radius:50%;background:var(--green,#65ce73);box-shadow:0 0 16px var(--green,#65ce73)}
    #volumeDialog .vu-machine .device-name{font-size:14px;font-weight:900;line-height:1} #volumeDialog .vu-machine .device-meta{margin-top:5px;font-size:10px;opacity:.75}
    #volumeDialog button{padding:8px 14px;border-radius:10px;border:1px solid #719ae5;background:#294c85;color:white;font:12px/1.2 sans-serif;cursor:pointer}
    #volumeDialog button:disabled{opacity:.5;cursor:default} #volumeDialog .vu-status{white-space:pre-wrap}
  `;document.head.append(style);
  const dialog=document.createElement('dialog');dialog.id='volumeDialog';dialog.setAttribute('aria-labelledby','volumeTitle');
  dialog.innerHTML='<header><h2 id="volumeTitle">Music over Games</h2><button class="vu-close" aria-label="Close">×</button></header><div class="vu-machines" role="radiogroup" aria-label="Batocera machine"></div><input class="vu-device" type="hidden"><ul class="vu-explanation"><li><strong>Music folder:</strong> Songs are stored in <span class="music-path">/userdata/music</span>.</li><li><strong>Music over Games:</strong> Keeps those songs playing while your games are playing.</li></ul><p>Games that bypass Batocera’s audio mixer are not supported.</p><input type="checkbox" class="vu-music" checked hidden><p>Plays from <span class="music-path">/userdata/music</span></p><p class="vu-status" role="status"></p><footer><button class="vu-disable" hidden>Disable feature</button><button class="vu-install">Install</button></footer>';
  document.body.append(dialog);
  const machines=dialog.querySelector('.vu-machines'),device=dialog.querySelector('.vu-device'),status=dialog.querySelector('.vu-status'),music=dialog.querySelector('.vu-music'),install=dialog.querySelector('.vu-install'),disable=dialog.querySelector('.vu-disable');
  let busy=false,checkId=0;
  function lock(value){busy=value;dialog.querySelectorAll('button,input').forEach(el=>el.disabled=value);}
  async function request(action){
    const response=await fetch('/api/keypad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,device:device.value,playDuringGames:music.checked}),signal:AbortSignal.timeout(30000)});
    const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'Music over Games setup failed.');return result;
  }
  function show(result){disable.hidden=!result.installed;install.textContent=result.installed?'Update setup':'Install';music.checked=true;status.textContent=result.installed?'Installed. Separate Music and Game mappings are available.'+(result.musicStreams!==undefined?'\nActive audio streams: music '+result.musicStreams+', game '+result.gameStreams+'.':'')+(result.warning?'\n'+result.warning:''):'Not installed. Standard overall-volume controls remain available.';}
  async function check(){const id=++checkId;lock(true);status.textContent='Checking this machine…';try{const result=await request('volume-status');if(id===checkId)show(result);}catch(e){status.textContent=e.message;disable.hidden=true;}finally{if(id===checkId)lock(false);}}
  function selectMachine(button){machines.querySelectorAll('.vu-machine').forEach(item=>{const selected=item===button;item.classList.toggle('selected',selected);item.setAttribute('aria-checked',String(selected));});device.value=button.dataset.device;check();}
  install.onclick=async()=>{let succeeded=false;lock(true);status.textContent='Installing Music over Games…';try{show(await request('volume-install'));install.textContent='Success';succeeded=true;}catch(e){status.textContent='Setup could not be confirmed: '+e.message+' Reopen this window to check the machine’s status.';}finally{lock(false);if(succeeded)install.disabled=true;}};
  disable.onclick=async()=>{if(!confirm('Disable separate audio controls and game-time music? Existing standard volume mappings are unchanged. Separate Music/Game mappings will stop working until this feature is installed again.'))return;lock(true);try{show(await request('volume-disable'));}catch(e){status.textContent=e.message;}finally{lock(false);}};
  dialog.querySelector('.vu-close').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.addEventListener('close',()=>{install.textContent=disable.hidden?'Install':'Update setup';install.disabled=false;});
  document.querySelector('#openVolumeUp').onclick=()=>{
    document.querySelector('#advancedFeatures')?.classList.remove('open');machines.replaceChildren();device.value='';
    const snapshot=window.getDiscoveredMachineStatuses?.()||{};
    for(const [id,m] of Object.entries(snapshot))if(m.online&&!m.usb&&(m.platform==='batocera'||(!m.platform&&m.access==='ssh'))){
      const card=document.createElement('button');card.type='button';card.className='vu-machine';card.dataset.device=id;card.dataset.platform='batocera';card.setAttribute('role','radio');card.setAttribute('aria-checked','false');
      const icon=document.createElement('div');icon.className='mini-pc';icon.setAttribute('aria-hidden','true');
      const labels=document.createElement('div'),title=document.createElement('div'),meta=document.createElement('div');title.className='device-name';title.textContent=m.displayName||id;meta.className='device-meta';meta.textContent=m.host||'Auto scan';labels.append(title,meta);card.append(icon,labels);card.onclick=()=>selectMachine(card);machines.append(card);
    }
    dialog.showModal();
    const first=machines.querySelector('.vu-machine');if(first)selectMachine(first);else{status.textContent='No Batocera machines have been discovered yet.';install.disabled=true;disable.hidden=true;}
  };
})();
