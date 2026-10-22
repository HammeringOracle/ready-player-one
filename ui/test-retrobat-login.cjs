const fs=require('fs'),assert=require('assert/strict');
const {chromium}=require('C:/Users/EF/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1000,height:700}});
 const html=fs.readFileSync('Ready Player One.html','utf8');
 await page.setContent('<article class="device-card" data-platform="retrobat" data-device="test" data-host="192.168.1.55"><div class="mini-pc"></div><div><div class="device-name">DESKTOP-VERYLONGHOSTNAME</div><div class="device-meta">192.168.1.55</div></div></article>');
 for(const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))await page.addStyleTag({content:m[1]});
 await page.addStyleTag({content:fs.readFileSync('ui/appearance.css','utf8')});
 const start=html.indexOf('    async function openRetroBatMachineCredentials');
 const end=html.indexOf("    document.querySelector('#openPygameCE')",start);
 await page.evaluate(()=>{window.closeAdvancedMenu=()=>{};window.machineDisplayName=()=> 'TEST-PC';window.apiBase='';window.syncStatus={};window.lastDeviceStatuses={};window.refreshDeviceStatuses=()=>{};window.fetch=async(u,opts)=>{window.sent=JSON.parse(opts.body);return {ok:true,json:async()=>({ok:true,remembered:true})};};});
 await page.addScriptTag({content:html.slice(start,end)});
 await page.evaluate(()=>openRetroBatMachineCredentials(document.querySelector('article')));
 assert.equal(await page.locator('input[type=password]').count(),1);
 await page.locator('input[name=username]').fill('TEST-PC\\user');
 await page.locator('button[type=submit]').click();
 await page.waitForFunction(()=>!document.querySelector('dialog'));
 assert.equal(await page.evaluate(()=>sent.host),'192.168.1.55');
 assert.equal(await page.evaluate(()=>sent.password),'');
 await page.evaluate(()=>{document.querySelector('article').dataset.platform='batocera';openRetroBatMachineCredentials(document.querySelector('article'));});
 assert.equal(await page.locator('dialog h2').textContent(),'Batocera Credentials');
 assert.equal(await page.locator('input[name=username]').inputValue(),'');
 await page.locator('input[name=username]').fill('manual-user');
 await page.locator('button[type=submit]').click();
 await page.waitForFunction(()=>!document.querySelector('dialog'));
 assert.equal(await page.evaluate(()=>sent.username),'manual-user');
 await page.evaluate(()=>{document.querySelector('article').dataset.platform='windows';openRetroBatMachineCredentials(document.querySelector('article'));});
 assert.equal(await page.locator('dialog h2').textContent(),'Windows Credentials');
 assert.equal(await page.locator('input[name=password]').getAttribute('placeholder'),'Windows account password (not PIN)');
 await page.locator('input[name=username]').fill('TEST-PC\\user');
 await page.locator('button[type=submit]').click();
 await page.waitForFunction(()=>!document.querySelector('dialog'));
 await page.evaluate(()=>{window.selectedDevice='other';document.querySelector('article').dataset.platform='lakka';openRetroBatMachineCredentials(document.querySelector('article'));});
 assert.equal(await page.locator('dialog h2').textContent(),'Lakka SSH Credentials');
 assert.equal(await page.locator('input[name=password]').getAttribute('placeholder'),'Typically: root');
 assert.equal(await page.locator('input[name=password]').inputValue(),'');
 await page.locator('input[name=username]').fill('manual-lakka-user');
 await page.locator('button[type=submit]').click();
 await page.waitForFunction(()=>!document.querySelector('dialog'));
 await page.evaluate(()=>document.querySelector('article').dataset.platform='retrobat');
 const fits=await page.locator('article').evaluate(card=>{const a=card.getBoundingClientRect();return [...card.querySelectorAll('.mini-pc,.device-name,.device-meta')].every(e=>{const r=e.getBoundingClientRect();return r.top>=a.top&&r.bottom<=a.bottom;});});
 assert.ok(fits,'Logo/name/IP must stay inside card');
 for(const action of ['x','cancel','escape']) {
   await page.evaluate(()=>{
     window.fetch=async(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError'))));
     openRetroBatMachineCredentials(document.querySelector('article'));
   });
   await page.locator('input[name=username]').fill('test');
   await page.locator('button[type=submit]').click();
   if(action==='x')await page.getByRole('button',{name:'Close credentials'}).click();
   else if(action==='cancel')await page.getByRole('button',{name:'Cancel',exact:true}).click();
   else await page.keyboard.press('Escape');
   await page.waitForFunction(()=>!document.querySelector('dialog'));
 }
 console.log('PASS: X, Cancel, Escape close an in-flight login');
 console.log('PASS: direct form, clicked host, blank password, safe close, long-host card bounds');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
