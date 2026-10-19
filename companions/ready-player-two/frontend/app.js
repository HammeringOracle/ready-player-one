const $ = id => document.getElementById(id);
// Fit the whole setup surface to the actual WebView client area, including
// small laptop displays and Windows display scaling. Do not clip controls.
function fitWindow() {
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  const scale = Math.min(1, width / 1000, height / 780);
  const main = document.querySelector('main');
  main.style.zoom = String(scale);
  main.style.width = `${width / scale}px`;
  main.style.height = `${height / scale}px`;
}
window.addEventListener('resize', fitWindow);
fitWindow();
let busy = false;
const failedBlankAccounts=new Set();
const asList = value => value == null ? [] : Array.isArray(value) ? value : [value];
let resultLines = [], resultPage = 0;
function renderResult() { const pages = Math.max(1, Math.ceil(resultLines.length / 6)); resultPage = Math.min(resultPage, pages - 1); $('result').textContent = resultLines.slice(resultPage * 6, resultPage * 6 + 6).join('\n'); $('page').textContent = `${resultPage + 1} / ${pages}`; $('previous').disabled = resultPage === 0; $('next').disabled = resultPage === pages - 1; }
function lock(value) { busy = value; for (const id of ['setup','check','account','network','private','blank']) $(id).disabled = value; }
function report(title, text, type = '') { $('resultTitle').textContent = title; $('resultTitle').className = type; resultLines = String(text).split('\n').flatMap(line => line.match(/.{1,46}/g) || ['']); resultPage = 0; renderResult(); }
async function run(action) {
  if (busy) return;
  const request = {platform:'all', folder:'', account:$('account').value.trim(), interfaceIndex:Number($('network').value), makePrivate:$('private').checked, allowBlankPassword:$('blank').checked};
  if(action==='setup'&&request.allowBlankPassword&&failedBlankAccounts.has(request.account.toLowerCase())){
    report('Empty-password retry blocked','That account already failed the empty-password test. Uncheck the blank-password option and use its actual Windows password when connecting. Sharing may already be configured.','error');return;
  }
  if (action === 'setup' && (!request.account || !request.interfaceIndex)) { report('Complete the setup fields','Choose an account and network.','error'); return; }
  lock(true);
  report(action === 'setup' ? 'Waiting for administrator approval…' : 'Checking this PC…', action === 'setup' ? 'Approve the Windows prompt to configure sharing. Keep this window open until setup finishes.' : 'Reading folder, share, and network settings. No changes are made.');
  try {
    const result = await window.__TAURI__.core.invoke('run_action',{action,request});
    if (!result.ok) { report('Setup needs attention', [result.error, 'Some setup steps may already have completed. Read the error before retrying.', ...asList(result.log)].join('\n'),'error'); return; }
    if (action === 'status') {
      $('machine').textContent = result.computer;
      if (!$('account').value) $('account').value = result.account;
      const previous = $('network').value;
      $('network').replaceChildren();
      for (const n of asList(result.networks)) { const option = document.createElement('option');option.value=n.index; option.textContent=`${n.name} · ${asList(n.addresses).join(', ') || 'No IPv4'} · ${n.category}`;$('network').append(option); }
      if ([...$('network').options].some(o=>o.value===previous)) $('network').value=previous;
      report('Current status', `Computer: ${result.computer}\nDetected: ${asList(result.detected).join(', ') || 'No supported programs found'}\n${asList(result.shares).join('\n')}\nBlank-password network policy: ${result.blankPasswordAllowed ? 'Allowed' : 'Restricted'}\nSelect your home Wi-Fi or Ethernet interface, not a VPN.`);
    } else {
      if(result.loginVerified===false){
        failedBlankAccounts.add(request.account.toLowerCase());
        report('Share configured — login needs attention',[result.warning,...asList(result.paths),`Windows account: ${result.account}`,'Do not repeat the empty-password test. No passwords were changed.','Your opted-in security policies remain in effect. Remote access is not verified.',...asList(result.log)].join('\n'),'error');
        return;
      }
      report('Local setup complete — remote test needed', ['Connect from the Ready Player One PC:', ...asList(result.paths), `Windows account: ${result.account}`, 'Use this exact account in File Explorer.', ...asList(result.log), 'Remote connectivity has not yet been verified.'].join('\n'),'success');
    }
  } catch (error) { report('Could not complete the request',String(error),'error'); }
  finally { lock(false); }
}
$('check').addEventListener('click',()=>run('status'));
$('setup').addEventListener('click',()=>run('setup'));
$('previous').addEventListener('click',()=>{resultPage--;renderResult();});
$('next').addEventListener('click',()=>{resultPage++;renderResult();});
const picker=document.createElement('dialog');
picker.className='platform-picker';
picker.setAttribute('aria-labelledby','picker-title');
picker.innerHTML='<h2 id="picker-title">Install your programs first</h2><p>Before running Ready Player Two, install every supported Windows program you want this PC to share.</p><h3>AUTOMATICALLY CONFIGURED ON THIS PC</h3><div class="warning-programs"><strong>RetroBat</strong><strong>RetroArch</strong><strong>ES-DE</strong><strong>Emu-Station</strong></div><h3>OTHER MACHINES RECOGNIZED BY READY PLAYER ONE</h3><div class="warning-programs recognized"><strong>Batocera</strong><strong>Recalbox</strong><strong>Lakka</strong><strong>RetroPie</strong></div><p class="picker-note">Ready Player Two automatically configures all supported Windows programs installed here. Ready Player One discovers the other machine types over the network.</p><div class="warning-actions"><button type="button" id="warning-ok" class="primary">OK</button></div>';
document.body.append(picker);
picker.addEventListener('cancel',event=>event.preventDefault());
picker.querySelector('#warning-ok').addEventListener('click',()=>{picker.close();picker.remove();run('status');});
picker.showModal();
