const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/EF/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage();let installed=false,calls=[];
  await page.route('http://volume.test/**',async route=>{
   if(route.request().url().endsWith('/api/keypad')){
    const b=route.request().postDataJSON();calls.push(b);
    if(b.action==='volume-install')installed=true;
    return route.fulfill({json:{ok:true,installed,mappings:[]}});
   }
   return route.fulfill({contentType:'text/html',body:'<div id="advancedFeatures"><button id="advancedToggle"></button><button id="openKeypad">Keypad</button><button id="openVolumeUp">Volume Up</button></div>'});
  });
  await page.goto('http://volume.test');
  await page.evaluate(()=>window.getDiscoveredMachineStatuses=()=>({one:{online:true,platform:'batocera',displayName:'BATOCERA',host:'192.168.12.234'}}));
  for(const file of ['keypad-ui.js','volume-ui.js'])await page.addScriptTag({content:fs.readFileSync('ui/'+file,'utf8')});
  await page.click('#openKeypad');await page.click('.layout-machine-card');await page.click('.kp-next');
  await page.waitForFunction(()=>!document.querySelector('.kp-close').disabled);
  await page.locator('.kp-key').first().click({button:'right'});
  assert(await page.locator('[data-action="volumeup"]').isVisible());
  assert(await page.locator('[data-action="music_up"]').isHidden());
  await page.click('.kp-close');await page.click('#openVolumeUp');
  await page.waitForFunction(()=>!document.querySelector('.vu-install').disabled);
  assert.equal(calls.filter(c=>c.action==='volume-install').length,0);
  await page.click('.vu-install');await page.waitForFunction(()=>document.querySelector('.vu-status').textContent.startsWith('Installed.'));
  assert.equal(calls.find(c=>c.action==='volume-install').playDuringGames,false);
  await page.click('.vu-close');await page.click('#openKeypad');await page.click('.layout-machine-card');await page.click('.kp-next');
  await page.waitForFunction(()=>!document.querySelector('.kp-close').disabled);
  await page.locator('.kp-key').first().click({button:'right'});
  assert(await page.locator('[data-action="volumeup"]').isVisible());
  assert(await page.locator('[data-action="music_up"]').isVisible());
  assert(await page.locator('[data-action="game_up"]').isHidden());
  await page.getByRole('radio',{name:'Emulator hotkeys',exact:true}).check();
  for(const op of ['up','down','mute'])assert(await page.locator(`[data-action="game_${op}"]`).isVisible());
  assert(await page.locator('[data-action="music_up"]').isHidden());
  console.log('PASS: opt-in setup, standard volume preserved, per-machine Music/Game action gating.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
