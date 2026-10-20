(() => {
  const style=document.createElement('style');
  style.textContent=`
    #keypadDialog{width:760px;max-width:none;max-height:none;box-sizing:border-box;overflow:hidden;border:1px solid #56647b;border-radius:10px;padding:11px 14px 10px;background:var(--panel,#1c2028);color:var(--text,#f0f3fa);box-shadow:0 24px 80px #0008}
    #keypadDialog::backdrop{background:#0009;backdrop-filter:blur(5px)}
    #keypadDialog header{display:flex;min-height:30px;align-items:center;justify-content:space-between;gap:10px}
    #keypadDialog footer{display:grid;grid-template-columns:1fr auto auto 1fr;align-items:center;gap:8px;margin-top:3px}
    #keypadDialog footer .kp-back{grid-column:1;justify-self:start} #keypadDialog footer .kp-profile{grid-column:2;justify-self:center} #keypadDialog footer .kp-profile-load{grid-column:3;justify-self:center} #keypadDialog footer .kp-next{grid-column:4;justify-self:end}
    #keypadDialog h2{margin:0;font-size:20px} #keypadDialog p{line-height:1.35}
    #keypadDialog button{cursor:pointer} #keypadDialog button:disabled{cursor:default;opacity:.5}
    #keypadDialog .kp-action[hidden]{display:none}
    #keypadDialog .kp-action{display:inline-flex;align-items:center;justify-content:center;min-height:32px;box-sizing:border-box;padding:7px 13px;border-radius:12px;border:1px solid #719ae5;background:#294c85;color:white;font:12px inherit;line-height:1;font-size:12px}
    #keypadDialog .kp-close{width:29px;height:29px;display:grid;place-items:center;padding:0;border-radius:50%;font:18px sans-serif;border:1px solid #8994a8;background:transparent;color:inherit}
    #keypadDialog .kp-machines{display:grid;grid-template-columns:repeat(auto-fit,180px);gap:10px;margin:10px 0}
    #keypadDialog .layout-machine-card{position:relative;width:180px;height:42px;box-sizing:border-box;text-align:left;grid-template-columns:minmax(0,1fr);padding:5px 20px 5px 52px}
    #keypadDialog .layout-machine-card > span:not(.mini-pc){min-width:0;width:100%}
    #keypadDialog .layout-machine-card .device-meta{width:auto;max-width:none;overflow:visible;text-overflow:clip;white-space:nowrap}
    #keypadDialog .layout-machine-card .mini-pc{position:absolute;top:50%;left:9px;transform:translateY(-50%)}
    #keypadDialog .layout-machine-card .device-name{white-space:normal;font-size:14px}
    #keypadDialog .layout-machine-card .device-meta{font-size:9px}
    #keypadDialog .layout-machine-card.unsupported{opacity:.38;filter:grayscale(1);cursor:not-allowed;border-color:#ffffff2e;box-shadow:none}
    #keypadDialog .layout-machine-card.unsupported::after{background:#788493;box-shadow:none}
    #keypadDialog .kp-board{margin:16px auto;padding:20px;width:min(340px,100%);box-sizing:border-box;background:linear-gradient(145deg,#353d4c,#11151d);border:1px solid #6e7d95;border-radius:24px;box-shadow:0 12px 30px #0005}
    #keypadDialog .kp-knobs{display:flex;justify-content:space-around;margin-bottom:18px}
    #keypadDialog .kp-knob{height:64px;width:64px;border-radius:50%;background:radial-gradient(circle,#343c4b 40%,#151a22 65%,#60708b 69%,#202630 74%);display:grid;place-items:center;font-size:10px;color:#dce4ef}
    #keypadDialog .kp-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    #keypadDialog .kp-key{aspect-ratio:1;display:flex;align-items:center;justify-content:center;flex-direction:column;border-radius:10px;border:1px solid #526078;background:#252c38;color:#aab6ca;font-size:11px;text-align:center;gap:4px}
    #keypadDialog .kp-key{width:100%;height:auto;min-height:0;max-width:none;padding:4px;min-width:0;font:10px/1.2 sans-serif;box-sizing:border-box;white-space:normal;box-shadow:none;overflow:hidden}
    #keypadDialog .kp-key[data-assigned="true"][data-applied="false"]{background:#48282c;color:#ffd5d8;border-color:#ef626c;box-shadow:0 0 0 2px #ef626c33}
    #keypadDialog .kp-key[data-assigned="true"][data-applied="true"]{background:#273f37;color:#c3f5d5;border-color:#76d59c;box-shadow:0 0 0 2px #76d59c33}
    #keypadDialog .kp-key[aria-pressed="true"]{outline:2px solid #8db7ff;outline-offset:2px}
    #keypadDialog .kp-editor{grid-column:2;grid-row:2/6;min-width:0}
    #keypadDialog .kp-editor h3{margin:0;font-size:18px;overflow-wrap:anywhere}
    #keypadDialog .kp-editor p{font-size:14px;margin:10px 0}
    #keypadDialog .kp-assignments{display:none!important}
    #keypadDialog .kp-option{padding:7px;min-height:30px;border:1px solid #65748b;border-radius:8px;background:#26364d;color:#fff;font:12px sans-serif;box-shadow:none;line-height:1.2}
    #keypadDialog .kp-option:hover{background:#3c5981}
    #keypadDialog .kp-option[hidden],#keypadDialog .kp-picker-tools[hidden]{display:none}
    #keypadDialog .kp-picker-tools{display:grid;grid-template-columns:repeat(2,minmax(0,130px));align-items:center;gap:8px;margin:10px 0}
    #keypadDialog .kp-picker-tools .kp-clear{grid-column:1/-1;justify-self:start}
    #keypadDialog .kp-picker-tools label{display:inline-flex;align-items:center;gap:5px;font:12px sans-serif;cursor:pointer}
    #keypadDialog .kp-picker-tools input{margin:0;width:14px;height:14px;accent-color:#8db7ff}
    #keypadDialog .kp-key strong{font:600 10px/1.2 sans-serif;max-width:100%;overflow-wrap:anywhere} #keypadDialog .kp-key span{font:9px/1.2 sans-serif;max-width:100%;overflow-wrap:anywhere} #keypadDialog .kp-key[data-assigned="false"] strong{font-weight:400;font-size:9px} #keypadDialog .kp-status{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.25;min-height:15px;margin:4px 0}
    #keypadDialog .kp-body.kp-preview{display:grid;grid-template-columns:240px minmax(0,1fr);gap:0 24px;align-items:start}
    #keypadDialog .kp-preview .kp-targets{grid-column:1/-1;margin:12px 0}
    #keypadDialog .kp-preview .kp-board{grid-column:1;grid-row:2/6;align-self:center;width:240px;margin:0;padding:14px}
    #keypadDialog .kp-body.kp-ps4{grid-template-columns:390px minmax(0,1fr);gap:0 18px}
    #keypadDialog .kp-ps4 .kp-board{position:relative;width:390px;height:290px;padding:0;border:0;border-radius:0;background:none;box-shadow:none}
    #keypadDialog .kp-ps4 .kp-shell{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 10px 8px #0006);pointer-events:none}
    #keypadDialog .kp-ps4 .kp-keys{position:absolute;inset:0;display:block}
    #keypadDialog .kp-ps4 .kp-knobs{display:none}
    #keypadDialog .kp-ps4 .kp-key{position:absolute;aspect-ratio:auto;border-radius:50%;width:32px;height:32px;padding:2px;background:linear-gradient(145deg,#3d4654,#151a22);border:1px solid #657185;box-shadow:0 2px 3px #0008;gap:0}
    #keypadDialog .kp-ps4 .kp-key strong{font:700 18px/1 sans-serif;color:var(--symbol,#d9e2ef)}
    #keypadDialog .kp-ps4 .kp-key > span{display:none}
    #keypadDialog .kp-ps4 .kp-key[data-assigned="true"][data-applied="false"]{background:#48282c;border-color:#ef626c;box-shadow:0 0 0 2px #ef626c55}
    #keypadDialog .kp-ps4 .kp-key[data-assigned="true"][data-applied="true"]{border-color:#76d59c;box-shadow:0 0 0 2px #76d59c55}
    #keypadDialog .kp-ps4 .kp-key:hover{filter:brightness(1.3)}
    #keypadDialog .kp-ps4 .kp-key.kp-dpad{border-radius:7px;width:28px;height:28px}
    #keypadDialog .kp-ps4 .kp-key.kp-shoulder{width:64px;height:25px;border-radius:12px 12px 6px 6px}
    #keypadDialog .kp-ps4 .kp-key.kp-shoulder strong,#keypadDialog .kp-ps4 .kp-key.kp-small strong{font-size:9px}
    #keypadDialog .kp-ps4 .kp-key.kp-small{width:27px;height:24px;border-radius:8px}
    #keypadDialog .kp-ps4 .kp-key.kp-small strong{font-size:6px;white-space:nowrap;overflow-wrap:normal}
    #keypadDialog .kp-ps4 .kp-key.kp-touchpad{width:112px;height:66px;border-radius:11px;background:radial-gradient(#526077 0.6px,transparent 0.8px) 0 0/4px 4px,linear-gradient(#303b4b,#1c2531)}
    #keypadDialog .kp-ps4 .kp-key.kp-touchpad strong{font-size:10px;color:#9baac0}
    #keypadDialog .kp-ps4 .kp-key.kp-stick{width:61px;height:61px;border:5px solid #111720;background:radial-gradient(circle,#343e4b 45%,#596678 49%,#202936 58%);box-shadow:0 0 0 1px #5c697d,0 4px 6px #0008}
    #keypadDialog .kp-ps4 .kp-key.kp-stick strong{font-size:11px}
    #keypadDialog .kp-preview .kp-board .kp-knobs{margin-bottom:12px}
    #keypadDialog .kp-preview .kp-board .kp-knob{width:102px;height:94px;display:grid;grid-template-columns:27px 48px 27px;gap:0;align-items:start;background:none;border:0;border-radius:0;padding:0;box-sizing:border-box}
    #keypadDialog .kp-knob-control{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:4px;width:100%;height:90px;min-width:0;padding:0;border:0;border-radius:6px;background:transparent;color:#dce4ef;box-shadow:none;font:9px/1.15 sans-serif;overflow-wrap:anywhere;white-space:normal}
    #keypadDialog .kp-knob-control strong{display:grid;place-items:center;width:100%;height:48px;font:30px/1 sans-serif;flex-shrink:0}
    #keypadDialog .kp-knob-control[data-motion="press"] strong{box-sizing:border-box;border:2px solid #65748b;border-radius:50%;background:radial-gradient(circle at 40% 35%,#465266,#1b2330 75%);font-size:30px;box-shadow:0 3px 5px #0005}
    #keypadDialog .kp-knob-control > span:not(.kp-install-state){box-sizing:border-box;min-height:18px;width:100%;display:grid;place-items:center;padding:2px 1px;border-radius:3px;background:#253044}
    #keypadDialog .kp-knob-control span{font:8px/1.15 sans-serif}
    #keypadDialog .kp-knob-control[data-assigned="true"][data-applied="false"]{color:#ffd5d8}
    #keypadDialog .kp-knob-control[data-assigned="true"][data-applied="false"] strong{border-color:#ef626c!important;box-shadow:0 0 0 2px #ef626c44}
    #keypadDialog .kp-knob-control[data-assigned="true"][data-applied="true"]{color:#c3f5d5}
    #keypadDialog .kp-knob-control[data-assigned="true"][data-applied="true"] strong{border-color:#76d59c!important;box-shadow:0 0 0 2px #76d59c44}
    #keypadDialog .kp-knob-control[aria-pressed="true"]{outline:2px solid #8db7ff;outline-offset:1px}
    #keypadDialog .kp-preview > p:not(.kp-targets),#keypadDialog .kp-preview > label,#keypadDialog .kp-preview > button{grid-column:2;margin:0 0 12px}
    #keypadDialog .kp-preview > label{display:grid;gap:8px}
    #keypadDialog .kp-source{width:100%;min-width:0;padding:8px;border:1px solid #65748b;border-radius:8px;background:var(--panel,#1c2028);color:inherit;font:inherit}
    #mechanicalSelect{box-sizing:border-box;width:min(460px,92vw);border:1px solid #65748b;border-radius:10px;padding:16px;background:var(--panel,#1c2028);color:var(--text,#f0f3fa)}
    #mechanicalSelect::backdrop{background:#0009;backdrop-filter:blur(4px)}
    #mechanicalSelect h3{margin:0 0 14px;font-size:20px}
    #mechanicalSelect p{font-size:14px;line-height:1.5;overflow-wrap:anywhere;white-space:pre-wrap}
    #mechanicalSelect footer{display:flex;justify-content:space-between;gap:12px}
    #mechanicalSelect button{display:inline-flex;align-items:center;justify-content:center;width:auto;height:auto;min-height:32px;padding:7px 13px;font:12px/1 sans-serif;border:1px solid #719ae5;border-radius:10px;background:#294c85;color:white}
    #remapperListen{box-sizing:border-box;width:min(480px,92vw);border:1px solid #65748b;border-radius:10px;padding:16px;background:var(--panel,#1c2028);color:var(--text,#f0f3fa);text-align:center}
    #remapperListen::backdrop{background:#000b;backdrop-filter:blur(5px)}
    #remapperListen h3{margin:0 0 12px;font-size:22px} #remapperListen p{margin:8px 0;line-height:1.55}
    #remapperListen .remapper-listen-pulse{width:82px;height:82px;margin:20px auto;border:3px solid #76d59c;border-radius:50%;display:grid;place-items:center;color:#c3f5d5;font-size:32px;box-shadow:0 0 0 0 #76d59c66;animation:remapperPulse 1.35s infinite}
    #remapperListen footer{display:flex;justify-content:center;margin-top:18px}
    #remapperListen button{min-height:34px;padding:8px 18px;border:1px solid #719ae5;border-radius:10px;background:#294c85;color:white}
    #remapperListen .remapper-device-tag{display:inline-flex;align-items:center;justify-content:center;min-height:38px;line-height:1.2;text-align:center;box-sizing:border-box}
    #remapperProfileSave{box-sizing:border-box;width:min(430px,92vw);border:1px solid #65748b;border-radius:10px;padding:16px;background:var(--panel,#1c2028);color:var(--text,#f0f3fa)}
    #remapperProfileSave::backdrop{background:#0009;backdrop-filter:blur(4px)}
    #remapperProfileSave h3{margin:0 0 8px;font-size:21px} #remapperProfileSave p{margin:0 0 14px;font-size:13px;line-height:1.5}
    #remapperProfileSave input{box-sizing:border-box;width:100%;height:42px;padding:8px 11px;border:1px solid #65748b;border-radius:9px;background:#151a22;color:inherit;font:14px inherit}
    #remapperProfileSave footer{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
    #remapperProfileSave button{min-height:34px;padding:8px 16px;border:1px solid #719ae5;border-radius:10px;background:#294c85;color:white}
    @keyframes remapperPulse{70%{box-shadow:0 0 0 18px #76d59c00}100%{box-shadow:0 0 0 0 #76d59c00}}
    #keypadDialog .kp-keyboard-open{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;height:34px;padding:4px 9px;border:1px solid #76d59c;border-radius:8px;background:#20352e;color:#c3f5d5}
    #keypadDialog .kp-keyboard-open svg{width:24px;height:18px;fill:none;stroke:currentColor;stroke-width:1.5}
    #keypadDialog .kp-functions-open{width:100%}
    #functionSelect{box-sizing:border-box;width:min(560px,94vw);max-height:86vh;overflow:auto;border:1px solid #65748b;border-radius:10px;padding:16px;background:var(--panel,#1c2028);color:var(--text,#f0f3fa)}
    #functionSelect::backdrop{background:#0009;backdrop-filter:blur(4px)}
    #functionSelect h3{margin:0 0 12px;font-size:21px} #functionSelect .fn-categories{display:flex;gap:16px;margin-bottom:14px}
    #functionSelect .fn-categories label{display:flex;align-items:center;gap:6px;font-size:13px}
    #functionSelect .fn-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
    #functionSelect .fn-option{display:flex;min-height:48px;padding:7px 9px;border:1px solid #65748b;border-radius:8px;background:#26364d;color:#fff;font:12px sans-serif;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-align:center}
    #functionSelect .fn-option strong{font:700 12px/1.15 sans-serif}
    #functionSelect .fn-option span{font:10px/1.15 sans-serif;color:#aebed4}
    #functionSelect footer{display:flex;justify-content:flex-end;margin-top:14px}
    #keyboardSelect{box-sizing:border-box;width:min(820px,96vw);max-height:90vh;overflow:auto;border:1px solid #65748b;border-radius:10px;padding:16px;background:var(--panel,#1c2028);color:var(--text,#f0f3fa)}
    #keyboardSelect::backdrop{background:#0009;backdrop-filter:blur(4px)}
    #keyboardSelect h3{margin:0 0 6px;font-size:20px} #keyboardSelect p{margin:0 0 14px;font-size:13px}
    #keyboardSelect .kb-board{display:grid;gap:6px;padding:10px;border:1px solid #4d596d;border-radius:10px;background:#151a22;min-width:690px}
    #keyboardSelect .kb-row{display:flex;gap:5px;align-items:stretch}
    #keyboardSelect .kb-row.kb-function{margin-bottom:6px}
    #keyboardSelect .kb-key{flex:1 1 0;min-width:37px;min-height:38px;padding:5px 3px;border:1px solid #65748b;border-radius:6px;background:#26364d;color:#fff;font:11px sans-serif;box-shadow:0 2px 2px #0006}
    #keyboardSelect .kb-key:hover{background:#3c5981}
    #keyboardSelect .kb-key[data-width="1.25"]{flex-grow:1.25} #keyboardSelect .kb-key[data-width="1.5"]{flex-grow:1.5}
    #keyboardSelect .kb-key[data-width="1.75"]{flex-grow:1.75} #keyboardSelect .kb-key[data-width="2"]{flex-grow:2}
    #keyboardSelect .kb-key[data-width="2.25"]{flex-grow:2.25} #keyboardSelect .kb-key[data-width="5"]{flex-grow:5}
    #keyboardSelect .kb-gap{flex:.45 1 0;min-width:14px}
    #keyboardSelect footer{display:flex;justify-content:flex-end;margin-top:14px}
  `;
  document.head.append(style);
  const dialog=document.createElement('dialog');dialog.id='keypadDialog';
  dialog.setAttribute('aria-labelledby','keypadTitle');
  dialog.innerHTML='<header><h2 id="keypadTitle">Remapper</h2><button class="kp-close" aria-label="Close">×</button></header><section class="kp-body"></section><p class="kp-status" role="status"></p><footer><button class="kp-action kp-back">Back</button><button class="kp-action kp-profile" hidden>Save Profile</button><button class="kp-action kp-profile-load" hidden>Load Profile</button><button class="kp-action kp-next">Next</button></footer>';
  document.body.append(dialog);
  const profileDialog=document.createElement('dialog');profileDialog.id='remapperProfileSave';profileDialog.setAttribute('aria-labelledby','remapperProfileTitle');
  profileDialog.innerHTML='<h3 id="remapperProfileTitle">Save Remapper Profile</h3><p>Name this reusable button layout.</p><input class="kp-profile-name" maxlength="80" autocomplete="off"><footer><button type="button" class="kp-profile-cancel">Cancel</button><button type="button" class="kp-profile-confirm">Save Profile</button></footer>';
  document.body.append(profileDialog);
  function askProfileName(suggested){
    const input=profileDialog.querySelector('.kp-profile-name');input.value=suggested;
    profileDialog.showModal();requestAnimationFrame(()=>{input.focus();input.select();});
    return new Promise(resolve=>{
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;profileDialog.close();resolve(value);};
      profileDialog.querySelector('.kp-profile-cancel').onclick=()=>finish(null);
      profileDialog.querySelector('.kp-profile-confirm').onclick=()=>finish(input.value.trim());
      profileDialog.oncancel=event=>{event.preventDefault();finish(null);};
      input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();finish(input.value.trim());}};
    });
  }
  // Fit the complete dialog, not a scrollable/clipped portion, including at Windows display scaling.
  let fitFrame;
  function fitDialog(){
    cancelAnimationFrame(fitFrame);
    fitFrame=requestAnimationFrame(()=>{
      if(!dialog.open)return;
      dialog.style.zoom='1';
      dialog.style.width=(body.classList.contains('kp-preview')?Math.max(580,Math.min(760,window.innerWidth-32)):Math.min(440,Math.max(320,window.innerWidth-32)))+'px';
      const scale=Math.min(1,(window.innerWidth-32)/dialog.offsetWidth,(window.innerHeight-32)/dialog.offsetHeight);
      dialog.style.zoom=String(scale);
    });
  }
  new MutationObserver(fitDialog).observe(dialog,{childList:true,subtree:true,characterData:true});
  window.addEventListener('resize',fitDialog);
  const body=dialog.querySelector('.kp-body'),status=dialog.querySelector('.kp-status'),next=dialog.querySelector('.kp-next'),back=dialog.querySelector('.kp-back'),saveProfile=dialog.querySelector('.kp-profile'),loadProfile=dialog.querySelector('.kp-profile-load');
  let machines=[],selected=new Set(),learned=null,busy=false,stage=0,run=0;
  const close=()=>{if(!busy){run++;dialog.close();}};
  dialog.querySelector('.kp-close').onclick=close;
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  let activeDeviceType='keypad';
  const ps4Labels=['△ Triangle','○ Circle','× Cross','□ Square','↑ D-pad','→ D-pad','↓ D-pad','← D-pad','L1','R1','L2','R2','Share','Options','PS','Touchpad','L3','R3'];
  async function request(data,signal){
    const machine=machines.find(([id])=>id===data.device)?.[1];
    const payload={deviceType:activeDeviceType,...data,...(machine?.instanceId?{installationId:machine.instanceId}:{})};
    const response=await fetch('/api/keypad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
    let result;try{result=await response.json();}catch{throw Error('The Ready Player One backend needs the keypad update loaded.');}
    if(!response.ok||!result.ok)throw Error(result.error||'Keypad setup failed.');
    return result;
  }
  function setBusy(value){busy=value;next.disabled=value;back.disabled=value;saveProfile.disabled=value;loadProfile.disabled=value;dialog.querySelector('.kp-close').disabled=value;}
  function picker(){
    next.hidden=false;
    body.classList.remove('kp-preview');
    stage=0;learned=null;status.textContent='';back.hidden=true;saveProfile.hidden=true;loadProfile.hidden=true;next.textContent='Next';
    body.replaceChildren();const intro=document.createElement('p');intro.textContent='Choose Machine And Have Device Plugged Into Said Machine';body.append(intro);
    const grid=document.createElement('div');grid.className='kp-machines';body.append(grid);
    for(const [id,machine] of machines){
      const platform=machine.usb?'batocera-usb':(machine.platform||'batocera');
      const supported=!machine.usb&&platform==='batocera';
      const card=document.createElement('button');card.type='button';card.className='layout-machine-card'+(supported?'':' unsupported');card.dataset.platform=platform;
      card.disabled=!supported;if(!supported)card.title='Not Supported';
      const icon=document.createElement('span');icon.className='mini-pc';icon.setAttribute('aria-hidden','true');
      const labels=document.createElement('span'),name=document.createElement('div'),ip=document.createElement('div');
      name.className='device-name';name.textContent=machine.displayName||id;ip.className='device-meta';ip.textContent=machine.host||'';labels.append(name,ip);card.append(icon,labels);
      card.setAttribute('aria-pressed',String(selected.has(id)));
      if(supported)card.onclick=event=>{
        if(event.ctrlKey){selected.has(id)?selected.delete(id):selected.add(id);}
        else{selected.clear();selected.add(id);}
        grid.querySelectorAll('.layout-machine-card').forEach(item=>item.setAttribute('aria-pressed',String(selected.has(item.dataset.device))));
        card.setAttribute('aria-pressed',String(selected.has(id)));next.disabled=!selected.size;
      };
      card.dataset.device=id;grid.append(card);
    }
    next.disabled=!selected.size;
  }
  async function listenForRemapper(){
    const source=machines.find(([id])=>selected.has(id));
    if(!source)throw Error('Choose a supported machine first.');
    const [device,machine]=source;
    const listen=document.createElement('dialog');listen.id='remapperListen';listen.setAttribute('aria-labelledby','remapperListenTitle');
    listen.innerHTML='<h3 id="remapperListenTitle">Identify Remapping Device</h3><div class="remapper-types" style="display:flex;gap:16px;justify-content:center;margin:18px 0"><label><input type="radio" name="remapperType" value="keypad" checked> 9 Mechanical/2 Vol</label><label><input type="radio" name="remapperType" value="ps4"> PS4 Controller</label></div><button type="button" class="remapper-start">Listen</button><p>Press a button on the selected device connected to <strong class="remapper-machine"></strong>.</p><div class="remapper-listen-pulse" aria-hidden="true" style="animation:none">⌨</div><p class="remapper-listen-status" role="status">Choose your device, then click Listen.</p><footer><button type="button" class="remapper-cancel">Cancel</button></footer>';
    listen.querySelector('.remapper-machine').textContent=machine.displayName||device;
    document.body.append(listen);
    const message=listen.querySelector('.remapper-listen-status');
    const cancel=listen.querySelector('.remapper-cancel');
    const start=listen.querySelector('.remapper-start');
    const controller=new AbortController();
    let cancelled=false;
    const finish=()=>{if(listen.open)listen.close();listen.remove();};
    let begin;
    const ready=new Promise(resolve=>{begin=resolve;});
    const tags=listen.querySelector('.remapper-types');tags.replaceChildren();tags.style.flexWrap='wrap';
    const registered=await request({action:'devices',device});
    const known=[{id:'6d7f:dcfe',name:'9 Mechanical/2 Vol'},{id:'054c:09cc',name:'PS4 Controller'}];
    for(const entry of registered.devices||[])if(!known.some(item=>item.id===entry.id))known.push(entry);
    for(const entry of known){
      const tag=document.createElement('button');tag.type='button';tag.className='remapper-device-tag';tag.textContent=entry.name;
      tag.style.cssText='padding:7px 16px;border-radius:12px;background:linear-gradient(180deg,#343c48,#171b21);border:1px solid #71849c;font-weight:800';
      tag.onclick=()=>begin(entry);tags.append(tag);
    }
    message.textContent='Select a saved device, or Listen to add another.';
    listen.querySelector('p').firstChild.textContent='To add hardware, click Listen and press a button on the device connected to ';
    cancel.onclick=()=>{cancelled=true;controller.abort();begin(false);finish();};
    listen.addEventListener('cancel',event=>{event.preventDefault();cancel.click();});
    listen.showModal();
    start.onclick=()=>begin(true);
    const choice=await ready;
    if(!choice)return false;
    if(choice!==true){
      finish();
      if(choice.id==='6d7f:dcfe'){activeDeviceType='keypad';return true;}
      if(/^054c:(05c4|09cc|0ba0)$/.test(choice.id)){activeDeviceType='ps4';return true;}
      status.textContent=choice.name+' selected. Its identity is saved; a mapping editor for this controller is not available yet.';
      return false;
    }
    start.disabled=true;
    tags.querySelectorAll('button').forEach(button=>button.disabled=true);
    message.textContent='Listening for a button…';
    listen.querySelector('.remapper-listen-pulse').style.animation='remapperPulse 1.35s infinite';
    try{
      let captured;
      do{captured=await request({action:'discover',device},controller.signal);}while(captured.waiting&&!cancelled);
      if(cancelled)return false;
      if(captured.id!=='6d7f:dcfe'&&!/^054c:(05c4|09cc|0ba0)$/.test(captured.id)){
        message.textContent='Saved '+captured.name+' to your device tags. A mapping editor for this controller is not available yet.';
        listen.querySelector('.remapper-listen-pulse').style.animation='none';
        cancel.textContent='Done';
        return await new Promise(resolve=>{cancel.onclick=()=>{finish();resolve(false);};});
      }
      activeDeviceType=captured.id==='6d7f:dcfe'?'keypad':'ps4';
      message.textContent='Device detected. Opening Remapper…';
      await new Promise(resolve=>setTimeout(resolve,450));
      finish();return true;
    }catch(error){
      if(cancelled)return false;
      message.textContent='Device not detected. '+error.message;
      listen.querySelector('.remapper-listen-pulse').style.animation='none';
      cancel.textContent='Back';
      return await new Promise(resolve=>{cancel.onclick=()=>{finish();resolve(false);};});
    }
  }
  const actions=[['','Unchanged'],['exit','Exit Emulator'],['f7','F7 / USB Boot'],['escape','Escape / Back'],['menu','Menu'],['pause','Pause'],['reset','Reset Game'],['save_state','Save State'],['restore_state','Load State'],['fastforward','Fast-forward'],['rewind','Rewind'],['screenshot','Screenshot'],['volumeup','Volume Up'],['volumedown','Volume Down'],['volumemute','Mute'],['next_slot','Next Save Slot'],['previous_slot','Previous Save Slot']];
  const actionDetails={exit:'Alt + F4',escape:'Escape key',menu:'Open emulator menu',pause:'Pause or resume emulator',reset:'Restart current game',save_state:'Save current state',restore_state:'Load current state',fastforward:'Toggle fast-forward',rewind:'Rewind gameplay',screenshot:'Capture screenshot',volumeup:'Increase overall volume',volumedown:'Decrease overall volume',volumemute:'Mute overall volume',next_slot:'Select next save slot',previous_slot:'Select previous save slot',music_up:'Increase music volume',music_down:'Decrease music volume',music_mute:'Mute music',game_up:'Increase game volume',game_down:'Decrease game volume',game_mute:'Mute game'};
  let slots=[],activeKey=0,draftWrites=Promise.resolve(),appliedLayout='[]',renderEditor=()=>{},markApplied=()=>{},draftSaveError=null;
  const separateAudio=new Set();
  for(const [group,label] of [['music','Music'],['game','Game']])for(const [op,suffix] of [['up','Volume Up'],['down','Volume Down'],['mute','Mute']]){
    const action=group+'_'+op;separateAudio.add(action);actions.push([action,label+' '+suffix]);
  }
  const layoutValue=entries=>JSON.stringify(entries.map((entry,index)=>({slot:entry.slot??index,action:entry.action||'',name:entry.name||'',codes:entry.codes||[],key:entry.key||'',eventType:entry.eventType||'key',direction:entry.direction||0})).filter(e=>e.action||e.codes.length||e.key).sort((a,b)=>a.slot-b.slot));
  const hasChanges=()=>layoutValue(slots.map((s,slot)=>({...s.learned,slot,action:s.action})))!==appliedLayout;
  const position=i=>activeDeviceType==='ps4'?ps4Labels[i]:['Top-left','Top-middle','Top-right','Middle-left','Center','Middle-right','Bottom-left','Bottom-middle','Bottom-right','Left knob counterclockwise','Left knob clockwise','Left knob press','Right knob counterclockwise','Right knob clockwise','Right knob press'][i];
  const actionLabel=action=>actions.find(([value])=>value===action)?.[1]||(action?.startsWith('key:')?action.slice(8).replaceAll('_',' '):'Selected button');
  const inputKeyLabel=key=>String(key||'').split(' + ').map(part=>{
    const names={KEY_ESC:'Esc',KEY_SPACE:'Space',KEY_ENTER:'Enter',KEY_LEFTCTRL:'Left Ctrl',KEY_RIGHTCTRL:'Right Ctrl',KEY_LEFTALT:'Left Alt',KEY_RIGHTALT:'Right Alt',KEY_LEFTSHIFT:'Left Shift',KEY_RIGHTSHIFT:'Right Shift',KEY_UP:'Up',KEY_DOWN:'Down',KEY_LEFT:'Left',KEY_RIGHT:'Right',BTN_SOUTH:'South / Cross',BTN_EAST:'East / Circle',BTN_NORTH:'North / Triangle',BTN_WEST:'West / Square'};
    return names[part]||part.replace(/^(?:KEY|BTN)_/,'').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,letter=>letter.toUpperCase());
  }).join(' + ');
  const buttonLabel=i=>slots[i]?.action ? actionLabel(slots[i].action) : 'Selected button';
  const signalId=s=>s.learned?JSON.stringify([s.learned.name,s.learned.eventType||'key',s.learned.codes||s.learned.key,s.learned.direction||0]):null;
  const conflicts=()=>slots.map((s,i)=>s.action&&s.learned&&slots.some((other,j)=>j!==i&&other.action&&other.action!==s.action&&signalId(other)===signalId(s))?i:null).filter(i=>i!==null);
  const ready=()=>slots.every(s=>!s.action||s.learned)&&(slots.some(s=>s.action)||slots.every(s=>!s.learned));
  async function preview(){
    appliedLayout='[]';next.hidden=true;saveProfile.hidden=false;loadProfile.hidden=false;
    body.classList.add('kp-preview');
    slots=Array.from({length:activeDeviceType==='ps4'?18:15},()=>({action:'',learned:null}));activeKey=0;
    stage=1;back.hidden=false;next.textContent='Apply Function';next.disabled=true;
    status.textContent='Right-click a key to assign an action. Click each assigned key, then press its physical button once before Apply.';
    body.innerHTML='<p class="kp-targets"></p><div class="kp-board"><div class="kp-knobs"><div class="kp-knob">Unchanged</div><div class="kp-knob">Unchanged</div></div><div class="kp-keys"></div></div><div class="kp-editor"><h3 class="kp-host"></h3><p class="kp-help">Right-click a key to choose its function. Click it to identify the physical button.</p><p class="kp-selection"></p><div class="kp-picker-tools" hidden><button type="button" class="kp-option kp-clear">Clear</button><button type="button" class="kp-keyboard-open" title="Choose a keyboard key"><svg viewBox="0 0 32 22" aria-hidden="true"><rect x="1" y="1" width="30" height="20" rx="3"/><path d="M5 6h2m3 0h2m3 0h2m3 0h2m3 0h2M5 11h2m3 0h2m3 0h2m3 0h2m3 0h2M7 16h18"/></svg><span>Keyboard</span></button><button type="button" class="kp-option kp-functions-open">Functions</button></div><div class="kp-assignments" hidden></div><p class="kp-support">Emulator hotkeys work only where the running emulator supports them.</p></div>';
    const ps4=activeDeviceType==='ps4';
    body.classList.toggle('kp-ps4',ps4);
    if(ps4){
      body.querySelector('.kp-knobs').hidden=true;
      body.querySelector('.kp-board').setAttribute('aria-label','PS4 Controller layout');
      body.querySelector('.kp-board').insertAdjacentHTML('afterbegin','<svg class="kp-shell" viewBox="0 0 390 290" aria-hidden="true"><defs><linearGradient id="kpShellShade" x2="0.3" y2="1"><stop stop-color="#4b5769"/><stop offset=".5" stop-color="#2a3341"/><stop offset="1" stop-color="#151c27"/></linearGradient></defs><path d="M79 49 Q42 51 30 95 L9 226 Q5 262 32 271 Q56 282 78 251 L115 204 Q195 225 275 204 L312 251 Q334 282 358 271 Q385 262 381 226 L360 95 Q348 51 311 49 Z" fill="url(#kpShellShade)" stroke="#69768b" stroke-width="1.5"/><path d="M40 166 24 230 Q20 249 36 255 M350 166 366 230 Q370 249 354 255" fill="none" stroke="#0e141d" stroke-width="5" stroke-linecap="round"/><rect x="152" y="51" width="86" height="4" rx="2" fill="#6faeff"/><g fill="#101722"><circle cx="187" cy="137" r="2"/><circle cx="195" cy="137" r="2"/><circle cx="203" cy="137" r="2"/><circle cx="191" cy="144" r="2"/><circle cx="199" cy="144" r="2"/></g></svg>');
    }
    const chosen=machines.filter(([id])=>selected.has(id));
    const source=chosen.find(([id])=>id===[...selected][0])||chosen[0];
    const hostname=source[1].displayName||source[0];
    let installedEntries=[];
    markApplied=()=>{installedEntries=slots.map((s,slot)=>({...s.learned,slot,action:s.action})).filter(s=>s.action);};
    draftSaveError=null;
    function saveDraft(){
      const snapshot=slots.map(s=>({action:s.action,token:s.learned?.token||null}));
      status.textContent='Saving edits…';
      draftWrites=draftWrites.then(async()=>{
        try{await request({action:'save',device:source[0],slots:snapshot});draftSaveError=null;status.textContent='Edits saved in Ready Player One. Apply to update the machine.';}
        catch(error){draftSaveError=error;status.textContent='Edits could not be saved: '+error.message;}
      });
      return draftWrites;
    }
    body.querySelector('.kp-targets').textContent='Apply to: '+chosen.map(([id,m])=>m.displayName||id).join(', ');
    body.querySelector('.kp-host').textContent=chosen.length===1?hostname:'Learn buttons on '+hostname;
    const keys=body.querySelector('.kp-keys'),menu=body.querySelector('.kp-assignments');
    const pickerTools=body.querySelector('.kp-picker-tools');
    const emulatorActions=new Set(['escape','menu','pause','reset','save_state','restore_state','fastforward','rewind','next_slot','previous_slot','game_up','game_down','game_mute']);
    let volumeInstalled=false;
    let category='global';
    function filterActions(){
      menu.querySelectorAll('.kp-option').forEach(option=>{
        const action=option.dataset.action;
        option.hidden=(category==='emulator'?!emulatorActions.has(action):action.startsWith('game_'))||(separateAudio.has(action)&&!volumeInstalled);
      });
      body.querySelector('.kp-support').textContent=(category==='global'?'Standard Volume Up/Down/Mute controls overall sound. Music controls affect only music.':'Game volume controls affect only the active emulator. Other actions depend on emulator support.')+(!volumeInstalled?' Install Music over Games in Advanced Features for separate Music and Game controls.':'');
      fitDialog();
    }
    body.querySelector('.kp-functions-open').onclick=()=>{
      if(busy)return;
      const functions=document.createElement('dialog');functions.id='functionSelect';functions.setAttribute('aria-labelledby','functionSelectTitle');
      functions.innerHTML='<h3 id="functionSelectTitle">Functions</h3><div class="fn-categories"><label><input type="radio" name="fn-category" value="global" checked> Global hotkeys</label><label><input type="radio" name="fn-category" value="emulator"> Emulator hotkeys</label></div><div class="fn-grid"></div><footer><button type="button" class="kp-action fn-cancel">Cancel</button></footer>';
      document.body.append(functions);
      const grid=functions.querySelector('.fn-grid');
      const keyboardOnlyActions=new Set(['f7','escape']);
      const draw=()=>{
        category=functions.querySelector('input[name="fn-category"]:checked').value;
        grid.replaceChildren();
        for(const [value,label] of actions){
          if(!value||value.startsWith('key:')||keyboardOnlyActions.has(value))continue;
          const hidden=(category==='emulator'?!emulatorActions.has(value):value.startsWith('game_'))||(separateAudio.has(value)&&!volumeInstalled);
          if(hidden)continue;
          const option=document.createElement('button');option.type='button';option.className='fn-option';
          const name=document.createElement('strong');name.textContent=label;option.append(name);
          const detail=actionDetails[value];if(detail){const description=document.createElement('span');description.textContent=detail;option.append(description);}
          option.onclick=()=>{slots[activeKey].action=value;functions.close();functions.remove();menu.hidden=true;render();saveDraft();};
          grid.append(option);
        }
      };
      functions.querySelectorAll('input[name="fn-category"]').forEach(radio=>radio.onchange=draw);
      const dismiss=()=>{functions.close();functions.remove();};
      functions.querySelector('.fn-cancel').onclick=dismiss;
      functions.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
      draw();functions.showModal();
    };
    body.querySelector('.kp-keyboard-open').onclick=()=>{
      if(busy)return;
      const keyboard=document.createElement('dialog');keyboard.id='keyboardSelect';keyboard.setAttribute('aria-labelledby','keyboardSelectTitle');
      keyboard.innerHTML='<h3 id="keyboardSelectTitle">Select Keyboard Key</h3><p>Choose the keyboard key this keypad control should send.</p><div class="kb-board"></div><footer><button type="button" class="kp-action kb-cancel">Cancel</button></footer>';
      document.body.append(keyboard);
      const k=(label,code,width=1)=>({label,code,width}), gap=()=>({gap:true});
      const letter=key=>k(key,'KEY_'+key), digit=key=>k(key,'KEY_'+key);
      const keyRows=[
        [k('Esc','KEY_ESC'),gap(),...Array.from({length:4},(_,i)=>k('F'+(i+1),'KEY_F'+(i+1))),gap(),...Array.from({length:4},(_,i)=>k('F'+(i+5),'KEY_F'+(i+5))),gap(),...Array.from({length:4},(_,i)=>k('F'+(i+9),'KEY_F'+(i+9)))],
        [k('` ~','KEY_GRAVE'),... '1234567890'.split('').map(digit),k('- _','KEY_MINUS'),k('= +','KEY_EQUAL'),k('Backspace','KEY_BACKSPACE',2)],
        [k('Tab','KEY_TAB',1.5),...'QWERTYUIOP'.split('').map(letter),k('[ {','KEY_LEFTBRACE'),k('] }','KEY_RIGHTBRACE'),k('\\\\ |','KEY_BACKSLASH',1.5)],
        [k('Caps Lock','KEY_CAPSLOCK',1.75),...'ASDFGHJKL'.split('').map(letter),k('; :','KEY_SEMICOLON'),k("' \"",'KEY_APOSTROPHE'),k('Enter','KEY_ENTER',2.25)],
        [k('Shift','KEY_LEFTSHIFT',2.25),...'ZXCVBNM'.split('').map(letter),k(', <','KEY_COMMA'),k('. >','KEY_DOT'),k('/ ?','KEY_SLASH'),k('Shift','KEY_RIGHTSHIFT',2.25)],
        [k('Ctrl','KEY_LEFTCTRL',1.25),k('Win','KEY_LEFTMETA',1.25),k('Alt','KEY_LEFTALT',1.25),k('Space','KEY_SPACE',5),k('Alt','KEY_RIGHTALT',1.25),k('Ctrl','KEY_RIGHTCTRL',1.25),gap(),k('←','KEY_LEFT'),k('↑','KEY_UP'),k('↓','KEY_DOWN'),k('→','KEY_RIGHT')],
        [k('Insert','KEY_INSERT'),k('Home','KEY_HOME'),k('Pg Up','KEY_PAGEUP'),k('Delete','KEY_DELETE'),k('End','KEY_END'),k('Pg Down','KEY_PAGEDOWN')]
      ];
      const board=keyboard.querySelector('.kb-board');
      keyRows.forEach((keys,rowIndex)=>{const row=document.createElement('div');row.className='kb-row'+(rowIndex===0?' kb-function':'');for(const item of keys){if(item.gap){const spacer=document.createElement('span');spacer.className='kb-gap';row.append(spacer);continue;}const key=document.createElement('button');key.type='button';key.className='kb-key';key.textContent=item.label;key.dataset.code=item.code;key.dataset.width=String(item.width);key.onclick=()=>{const action='key:'+item.code;if(!actions.some(([value])=>value===action))actions.push([action,item.label]);slots[activeKey].action=action;keyboard.close();keyboard.remove();menu.hidden=true;render();saveDraft();};row.append(key);}board.append(row);});
      const dismiss=()=>{keyboard.close();keyboard.remove();};keyboard.querySelector('.kb-cancel').onclick=dismiss;keyboard.addEventListener('cancel',event=>{event.preventDefault();dismiss();});keyboard.showModal();
    };
    body.querySelector('.kp-clear').onclick=()=>{if(busy)return;slots[activeKey]={action:'',learned:null};render();saveDraft();status.textContent='Selected button cleared. Apply to update the machine.';};
    const controls=[];
    body.querySelectorAll('.kp-knob').forEach(knob=>knob.replaceChildren());
    function render(){
      pickerTools.hidden=menu.hidden;
      body.querySelector('.kp-help').hidden=!menu.hidden;
      pickerTools.querySelectorAll('button,input').forEach(control=>control.disabled=busy);
      controls.forEach((key,i)=>{
        const slot=slots[i];key.replaceChildren();
        const label=actionLabel(slot.action);
        const title=document.createElement('strong');title.textContent=ps4?(i<8?ps4Labels[i].split(' ')[0]:ps4Labels[i]):i<9?label:['↶','↷','↓'][(i-9)%3];
        const shortLabel={volumeup:'Vol +',volumedown:'Vol −',volumemute:'Mute',next_slot:'Slot +',previous_slot:'Slot −'}[slot.action]||label;
        const shortcutLabel={exit:'Alt + F4',escape:'Esc',menu:'Space / Tab'}[slot.action];
        const detectedInput=slot.learned?.key?inputKeyLabel(slot.learned.key):'';
        const code=document.createElement('span');code.textContent=slot.action
          ? (detectedInput?`Input: ${detectedInput}`:(ps4?'Press to identify':i<9?(shortcutLabel||'Press to identify'):shortLabel))
          : (ps4||i>=9?'—':'');
        key.title=(ps4?position(i)+' — ':'')+label+(shortcutLabel?' — Output: '+shortcutLabel:'')+(slot.action?(detectedInput?` — Input: ${detectedInput} (${slot.learned.key})`:' — Press to identify'):'');
        key.append(title,code);key.dataset.assigned=String(!!slot.action);key.setAttribute('aria-pressed',String(i===activeKey));key.disabled=busy;
        if(slot.action){
          const saved=installedEntries.find(entry=>entry.slot===i);
          const isInstalled=!!saved&&layoutValue([{...saved,slot:i}])===layoutValue([{...slot.learned,slot:i,action:slot.action}]);
          key.dataset.applied=String(isInstalled);
          const state=document.createElement('span');state.className='kp-install-state';state.textContent=isInstalled?'Applied':'Not applied';key.append(state);
        } else delete key.dataset.applied;
      });
      body.querySelector('.kp-selection').textContent=buttonLabel(activeKey)+(slots[activeKey]?.learned?.key?` · Input: ${inputKeyLabel(slots[activeKey].learned.key)}`:'');
      
      next.textContent=slots.filter(s=>s.action).length>1?'Apply Functions':'Apply Function';
      next.hidden=!hasChanges();
      next.disabled=busy||!hasChanges();
      const pending=slots.map((s,i)=>s.action&&!s.learned?buttonLabel(i):null).filter(Boolean);
      next.title=busy?'Waiting for button detection…':'Apply mapping changes';
      body.querySelector('.kp-selection').textContent=buttonLabel(activeKey)+(slots[activeKey]?.learned?.key?` · Input: ${inputKeyLabel(slots[activeKey].learned.key)}`:'')+(!busy&&pending.length?' — waiting for: '+pending.join(', '):'');
    }
    renderEditor=render;
    function choose(i,showMenu){
      if(busy||stage!==1)return;
      activeKey=i;menu.hidden=!showMenu;render();
    }
    for(let i=0;i<slots.length;i++){
      const key=document.createElement('button');key.type='button';key.className=ps4||i<9?'kp-key':'kp-knob-control';key.setAttribute('aria-label',position(i)+(i<9?' button':''));
      key.onclick=()=>{if(busy||stage!==1)return;choose(i,false);captureKey();};
      key.oncontextmenu=e=>{e.preventDefault();choose(i,true);};
      key.onkeydown=e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();choose(i,true);}};
      if(!ps4&&i>=9){key.dataset.motion=['counterclockwise','clockwise','press'][(i-9)%3];key.style.gridColumn=String([1,3,2][(i-9)%3]);key.style.gridRow='1';}
      controls.push(key);
      if(ps4){
        const places=[[300,77],[334,110],[300,143],[266,110],[60,79],[90,109],[60,139],[30,109],[50,42],[276,42],[50,12],[276,12],[108,78],[255,78],[181,162],[139,65],[111,159],[218,159]];
        const [left,top]=places[i];key.style.left=left+'px';key.style.top=top+'px';
        if(i<4)key.style.setProperty('--symbol',['#65dfba','#ff818b','#86b9ff','#eda1d3'][i]);
        key.classList.add(i>=16?'kp-stick':i===15?'kp-touchpad':i>=12?'kp-small':i>=8?'kp-shoulder':i>=4?'kp-dpad':'kp-face');
        keys.append(key);
      }
      else if(i<9)keys.append(key);
      else body.querySelectorAll('.kp-knob')[Math.floor((i-9)/3)].append(key);
    }
    for(const [value,label] of actions){
      if(!value)continue;
      const option=document.createElement('button');option.type='button';option.className='kp-option';option.textContent=label;option.dataset.action=value;
      option.onclick=()=>{if(busy||stage!==1)return;slots[activeKey].action=value;menu.hidden=true;render();saveDraft();};menu.append(option);
    }
    filterActions();
    function captureKey(){
      const i=activeKey;setBusy(true);menu.hidden=true;render();
      const movement=ps4?'press and release '+ps4Labels[i]:i<9?'press and release the physical key':(i-9)%3===2?'press and release the '+(i<12?'left':'right')+' knob':'turn the '+(i<12?'left':'right')+' knob one notch '+((i-9)%3===0?'counterclockwise':'clockwise');
      const prompt=document.createElement('dialog');prompt.id='mechanicalSelect';prompt.setAttribute('aria-labelledby','mechanicalSelectTitle');
      prompt.innerHTML='<h3 id="mechanicalSelectTitle">Select Mechanical Button</h3><p class="mechanical-target"></p><p class="mechanical-message" role="status"></p><footer><button class="mechanical-cancel">Cancel</button><button class="mechanical-start">Start Listening</button></footer>';
      document.body.append(prompt);
      const message=prompt.querySelector('.mechanical-message'),start=prompt.querySelector('.mechanical-start'),cancel=prompt.querySelector('.mechanical-cancel');
      if(ps4)prompt.querySelector('h3').textContent='Identify PS4 Control';
      prompt.querySelector('.mechanical-target').textContent=hostname+' — '+buttonLabel(i);
      message.textContent='Press the physical keypad button you want to pair with this pictured key. Nothing is installed yet.';
      let listening=false,finished=false,cancelled=false,closed=false;
      let captureController;
      const dismiss=()=>{if(closed)return;closed=true;prompt.close();prompt.remove();setBusy(false);render();};
      const stop=()=>{cancelled=true;captureController?.abort();dismiss();};
      cancel.onclick=stop;
      prompt.addEventListener('cancel',event=>{event.preventDefault();stop();});
      start.onclick=async()=>{
        if(finished){dismiss();return;}
        listening=true;cancelled=false;start.disabled=true;cancel.disabled=false;start.textContent='Listening…';
        captureController=new AbortController();
        message.textContent='On '+hostname+', '+movement+'. This window will keep waiting until the signal is detected or you cancel.';
        try{
          let captured;
          do {captured=await request({action:'learn',device:source[0]},captureController.signal);}while(captured.waiting&&!cancelled);
          if(cancelled)return;
          slots[i].learned=captured;finished=true;
          await saveDraft();
          if(cancelled)return;
          const duplicate=conflicts();
          message.textContent=buttonLabel(i)+' identified as '+inputKeyLabel(captured.key)+'.'+(draftSaveError?' Edits could not be saved.':'');
          status.textContent=draftSaveError?'Edits could not be saved: '+draftSaveError.message:buttonLabel(i)+' input: '+inputKeyLabel(captured.key)+'.'+(!duplicate.length&&ready()?' Ready to Apply.':'');
          start.textContent='Done';cancel.hidden=true;
        }catch(e){if(!cancelled){message.textContent='Button not identified.\n'+e.message;start.textContent='Try Again';}}
        finally{listening=false;start.disabled=false;cancel.disabled=false;if(cancelled)dismiss();}
      };
      prompt.showModal();
      // Paint the selection window before starting detection; no second user click needed.
      requestAnimationFrame(()=>requestAnimationFrame(()=>{if(prompt.open)start.click();}));
    }
    setBusy(true);render();status.textContent='Restoring saved keypad layout for '+hostname+'…';
    try{
      await draftWrites;
      const saved=await request({action:'load',device:source[0]});
      const audioStatus=await Promise.all(chosen.map(async([device])=>{try{return (await request({action:'volume-status',device})).installed===true;}catch{return false;}}));
      volumeInstalled=audioStatus.every(Boolean);filterActions();
      installedEntries=(saved.appliedMappings||(!saved.draft?saved.mappings:[])||[]).map((entry,index)=>({...entry,slot:entry.slot??index}));
      for(const [index,entry] of (saved.mappings||[]).entries()){
        const slot=Number.isInteger(entry.slot)?entry.slot:index;
        if(slot>=0&&slot<slots.length&&(actions.some(([value])=>value===entry.action)||entry.action?.startsWith('key:'))){if(entry.action.startsWith('key:')&&!actions.some(([value])=>value===entry.action))actions.push([entry.action,actionLabel(entry.action)]);slots[slot]={action:entry.action,learned:entry.token?entry:null};}
      }
      appliedLayout=layoutValue(installedEntries);
      status.textContent=saved.draft?'Saved edits restored. These edits have not been installed.':saved.mappings?.length?(saved.imported?'Recovered installed assignments. Older mappings may lack positions; review the pictured keys before Apply.':'Saved keypad layout restored for '+hostname+'.'):'No saved layout yet. Assign and identify buttons; Apply saves this machine’s layout.';
    }catch(error){status.textContent='Could not restore the layout: '+error.message;}
    finally{setBusy(false);render();}
  }
  back.onclick=picker;
  saveProfile.onclick=async()=>{
    const source=machines.find(([id])=>selected.has(id));
    if(!source)return;
    const profileName=await askProfileName(`${source[1].displayName||source[0]} Remapper`);
    if(profileName===null)return;
    setBusy(true);
    try{
      await draftWrites;
      const saved=await request({action:'profile-save',device:source[0],profileName,slots:slots.map((s,slot)=>({...s.learned,slot,action:s.action}))});
      status.textContent=`Profile saved: ${saved.name}`;
    }catch(error){status.textContent='Profile could not be saved: '+error.message;}
    finally{setBusy(false);renderEditor();}
  };
  loadProfile.onclick=async()=>{
    const source=machines.find(([id])=>selected.has(id));
    if(!source)return;
    setBusy(true);
    try{
      const listed=await request({action:'profile-list',device:source[0]});
      if(!listed.profiles.length)throw Error('No compatible profiles are saved in '+listed.folder+'.');
      const chooser=document.createElement('dialog');chooser.id='remapperProfileSave';chooser.setAttribute('aria-labelledby','remapperProfileLoadTitle');
      chooser.innerHTML='<h3 id="remapperProfileLoadTitle">Load Remapper Profile</h3><p>Select a reusable button layout.</p><select class="kp-profile-list" style="box-sizing:border-box;width:100%;height:42px;padding:8px 11px;border:1px solid #65748b;border-radius:9px;background:#151a22;color:inherit;font:14px inherit"></select><footer><button type="button" class="kp-profile-cancel">Cancel</button><button type="button" class="kp-profile-confirm">Load Profile</button></footer>';
      document.body.append(chooser);const select=chooser.querySelector('select');
      listed.profiles.forEach(profile=>{const option=document.createElement('option');option.value=profile.fileName;option.textContent=profile.name;select.append(option);});
      const selectedFile=await new Promise(resolve=>{let settled=false;const finish=value=>{if(settled)return;settled=true;chooser.close();chooser.remove();resolve(value);};chooser.querySelector('.kp-profile-cancel').onclick=()=>finish(null);chooser.querySelector('.kp-profile-confirm').onclick=()=>finish(select.value);chooser.oncancel=event=>{event.preventDefault();finish(null);};chooser.showModal();});
      if(!selectedFile)return;
      const loaded=await request({action:'profile-load',device:source[0],fileName:selectedFile});
      slots=Array.from({length:activeDeviceType==='ps4'?18:15},()=>({action:'',learned:null}));
      for(const [index,entry] of loaded.mappings.entries()){
        const slot=Number.isInteger(entry.slot)?entry.slot:index;
        if(slot>=0&&slot<slots.length){if(entry.action?.startsWith('key:')&&!actions.some(([value])=>value===entry.action))actions.push([entry.action,actionLabel(entry.action)]);slots[slot]={action:entry.action||'',learned:entry.token?entry:null};}
      }
      await saveDraft();renderEditor();status.textContent=`Profile loaded: ${loaded.name}. Red mappings are not applied; choose Apply to install them.`;
    }catch(error){status.textContent='Profile could not be loaded: '+error.message;}
    finally{setBusy(false);renderEditor();}
  };
  next.onclick=async()=>{
    if(stage===0){
      setBusy(true);status.textContent='';
      try{if(await listenForRemapper())await preview();}
      catch(error){status.textContent=error.message;}
      finally{if(stage===0)setBusy(false);}
      return;
    }
    if(stage===2){close();return;}
    if(busy||!hasChanges())return;
    if(!ready()){
      status.textContent=slots.some(s=>s.action)?'Identify the mechanical button for: '+slots.filter(s=>s.action&&!s.learned).map(s=>actionLabel(s.action)).join(', ')+'. Your edits are saved; nothing has been installed.':'Choose a function for the identified button before installing. Your edits are saved.';
      return;
    }
    setBusy(true);body.querySelector('.kp-assignments').hidden=true;
    renderEditor();
    await draftWrites;
    if(draftSaveError){setBusy(false);renderEditor();status.textContent='Apply stopped because your edits could not be saved. Change the assignment to retry saving. '+draftSaveError.message;return;}
    body.querySelectorAll('.kp-key,.kp-knob-control').forEach(k=>k.disabled=true);
    const mappings=slots.map((s,slot)=>({...s,slot})).filter(s=>s.action).map(s=>({slot:s.slot,token:s.learned.token,action:s.action}));
    const results=[];let failed=false;
    for(const [id,m] of machines.filter(([id])=>selected.has(id))){
      status.textContent=results.join('\n')+'\nApplying to '+(m.displayName||id)+'…';
      try{const result=await request({action:'apply',device:id,mappings,replaceLayout:true});if(!result.installed)throw Error('Installation was not confirmed.');results.push((m.displayName||id)+': Installed.');}
      catch(e){failed=true;results.push((m.displayName||id)+': Not installed — '+e.message);}
    }
    setBusy(false);stage=1;back.hidden=false;
    if(!failed){appliedLayout=layoutValue(slots.map((s,slot)=>({...s.learned,slot,action:s.action})));markApplied();}
    renderEditor();status.textContent=results.join('\n');
  };
  document.querySelector('#openKeypad').onclick=()=>{
    document.querySelector('#advancedFeatures').classList.remove('open');document.querySelector('#advancedToggle').setAttribute('aria-expanded','false');
    ++run;selected=new Set();learned=null;body.replaceChildren();back.hidden=true;next.disabled=true;
    // Reuse the exact discovery snapshot used by the machine cards. No network wait on open.
    const discovered=window.getDiscoveredMachineStatuses?.()||{};
    machines=Object.entries(discovered).filter(([,m])=>m.online);
    picker();
    if(!machines.length)status.textContent='No active machines have been discovered yet. Once one appears at the top, reopen Remapper.';
    dialog.showModal();fitDialog();
  };
})();
