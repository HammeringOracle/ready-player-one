(() => {
  const style=document.createElement('style');style.textContent=`
    #volumeDialog{box-sizing:border-box;width:min(460px,94vw);max-height:90vh;overflow:auto;border:1px solid #65748b;border-radius:16px;padding:12px 14px;background:var(--panel,#1c2028);color:var(--text,#f0f3fa)}
    #volumeDialog::backdrop{background:#0009} #volumeDialog header,#volumeDialog footer{display:flex;justify-content:space-between;align-items:center;gap:12px}
    #volumeDialog h2{margin:0;font-size:22px} #volumeDialog p,#volumeDialog label{margin:6px 0;font-size:13px;line-height:1.35}
    #volumeDialog .vu-explanation{margin:8px 0;padding-left:20px;font-size:13px;line-height:1.4}
    #volumeDialog .vu-explanation li+li{margin-top:4px}
    #volumeDialog .music-path{display:inline-block;padding:1px 6px;border-radius:5px;color:#ffd66b;background:rgba(224,171,48,.13);font-weight:800;text-shadow:0 0 8px rgba(255,196,65,.18)}
    #volumeDialog .vu-machines{display:grid;grid-template-columns:repeat(auto-fit,180px);gap:10px;margin:10px 0;padding:0;white-space:normal}
    #volumeDialog .layout-machine-card{position:relative;width:180px;height:42px;box-sizing:border-box;text-align:left;grid-template-columns:minmax(0,1fr);padding:5px 20px 5px 52px}
    #volumeDialog .layout-machine-card > :not(.mini-pc){min-width:0;width:100%;overflow:hidden}
    #volumeDialog .layout-machine-card .mini-pc{position:absolute;top:50%;left:9px;transform:translateY(-50%)}
    #volumeDialog .layout-machine-card .device-name{white-space:normal;font-size:14px}
    #volumeDialog .layout-machine-card .device-meta{width:auto;max-width:none;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px}
    #volumeDialog button{padding:7px 13px;border-radius:9px;border:1px solid #719ae5;background:#294c85;color:white;font:12px/1.2 sans-serif;cursor:pointer}
    #volumeDialog footer{margin-top:8px}
    #volumeDialog :is(.vu-install,.vu-disable){position:relative;overflow:hidden;border-color:rgba(115,174,255,.88);background:linear-gradient(180deg,rgba(255,255,255,.27),rgba(48,111,190,.7) 43%,rgba(18,48,91,.94));text-shadow:0 1px 1px rgba(0,0,0,.72);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 -1px 0 rgba(0,0,0,.42),0 4px 9px rgba(0,0,0,.5)}
    #volumeDialog :is(.vu-install,.vu-disable)::before{content:"";position:absolute;inset:1px 4px auto;height:43%;border-radius:6px 6px 50% 50%;background:linear-gradient(180deg,rgba(255,255,255,.38),rgba(255,255,255,.03));pointer-events:none}
    #volumeDialog .vu-disable{border-color:rgba(255,127,118,.86);background:linear-gradient(180deg,rgba(255,255,255,.25),rgba(181,58,53,.68) 43%,rgba(83,20,22,.94))}
    #volumeDialog :is(.vu-install,.vu-disable):hover{filter:brightness(1.13)}
    #volumeDialog :is(.vu-install,.vu-disable):active{transform:translateY(1px);box-shadow:inset 0 2px 4px rgba(0,0,0,.55),0 1px 2px rgba(0,0,0,.36)}
    #volumeDialog button:disabled{opacity:.5;cursor:default} #volumeDialog .vu-status{white-space:pre-wrap}
  `;document.head.append(style);
  const dialog=document.createElement('dialog');dialog.id='volumeDialog';dialog.setAttribute('aria-labelledby','volumeTitle');
  dialog.innerHTML='<header><h2 id="volumeTitle">Music over Games</h2><button class="vu-close" aria-label="Close">×</button></header><div class="vu-machines" role="radiogroup" aria-label="Batocera machine"></div><input class="vu-device" type="hidden"><ul class="vu-explanation"><li><strong>Music folder:</strong> Songs are stored in <span class="music-path">/userdata/music</span>.</li><li><strong>Music over Games:</strong> Keeps those songs playing while your games are playing.</li><li>Games that bypass Batocera’s audio mixer are not supported.</li></ul><input type="checkbox" class="vu-music" checked hidden><p class="vu-status" role="status"></p><footer><button class="vu-disable" hidden>Disable feature</button><button class="vu-install">Install</button></footer>';
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
  function selectMachine(button){machines.querySelectorAll('.layout-machine-card').forEach(item=>{const selected=item===button;item.setAttribute('aria-pressed',String(selected));item.setAttribute('aria-checked',String(selected));});device.value=button.dataset.device;check();}
  install.onclick=async()=>{let succeeded=false;lock(true);status.textContent='Installing Music over Games…';try{show(await request('volume-install'));install.textContent='Success';succeeded=true;}catch(e){status.textContent='Setup could not be confirmed: '+e.message+' Reopen this window to check the machine’s status.';}finally{lock(false);if(succeeded)install.disabled=true;}};
  disable.onclick=async()=>{if(!confirm('Disable separate audio controls and game-time music? Existing standard volume mappings are unchanged. Separate Music/Game mappings will stop working until this feature is installed again.'))return;lock(true);try{show(await request('volume-disable'));}catch(e){status.textContent=e.message;}finally{lock(false);}};
  dialog.querySelector('.vu-close').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.addEventListener('close',()=>{install.textContent=disable.hidden?'Install':'Update setup';install.disabled=false;});
  document.querySelector('#openVolumeUp').onclick=()=>{
    document.querySelector('#advancedFeatures')?.classList.remove('open');machines.replaceChildren();device.value='';
    const snapshot=window.getDiscoveredMachineStatuses?.()||{};
    for(const [id,m] of Object.entries(snapshot))if(m.online&&!m.usb&&(m.platform==='batocera'||(!m.platform&&m.access==='ssh'))){
      const card=document.createElement('button');card.type='button';card.className='layout-machine-card vu-machine';card.dataset.device=id;card.dataset.platform='batocera';card.setAttribute('role','radio');card.setAttribute('aria-checked','false');card.setAttribute('aria-pressed','false');
      const icon=document.createElement('div');icon.className='mini-pc';icon.setAttribute('aria-hidden','true');
      const labels=document.createElement('div'),title=document.createElement('div'),meta=document.createElement('div');title.className='device-name';title.textContent=m.displayName||id;meta.className='device-meta';meta.textContent=m.host||'Auto scan';labels.append(title,meta);card.append(icon,labels);card.onclick=()=>selectMachine(card);machines.append(card);
    }
    dialog.showModal();
    const first=machines.querySelector('.layout-machine-card');if(first)selectMachine(first);else{status.textContent='No Batocera machines have been discovered yet.';install.disabled=true;disable.hidden=true;}
  };
})();
