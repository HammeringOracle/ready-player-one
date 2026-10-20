const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const {chromium} = require('C:/Users/EF/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1100,height:760}});
    await page.route('http://remapper.test/**', route => {
      if (route.request().url().endsWith('/api/keypad')) {
        const body = route.request().postDataJSON();
        if (body.action === 'devices') return route.fulfill({json:{ok:true,devices:[]}});
        if (body.action === 'volume-status') return route.fulfill({json:{ok:true,installed:false}});
        if (body.action === 'load') {
          const mapping={slot:0,action:'pause',name:'Mechanical Keyboard',key:'KEY_A',codes:[30],token:'restored'};
          return route.fulfill({json:{ok:true,mappings:[mapping],appliedMappings:[mapping]}});
        }
        return route.fulfill({json:{ok:true}});
      }
      return route.fulfill({contentType:'text/html',body:'<div id="advancedFeatures"><button id="advancedToggle"></button><button id="openKeypad">Open</button></div>'});
    });
    await page.goto('http://remapper.test');
    await page.addStyleTag({content:fs.readFileSync('ui/appearance.css','utf8')});
    await page.addScriptTag({content:fs.readFileSync('ui/keypad-ui.js','utf8')});
    await page.evaluate(()=>{window.getDiscoveredMachineStatuses=()=>({Batocera:{online:true,platform:'batocera',displayName:'BATOCERA',host:'192.168.12.235'}});});
    await page.click('#openKeypad');
    assert.equal(await page.locator('#keypadDialog').evaluate(el=>getComputedStyle(el).borderRadius),'10px');
    const padding=await page.locator('#keypadDialog').evaluate(el=>({top:parseFloat(getComputedStyle(el).paddingTop),bottom:parseFloat(getComputedStyle(el).paddingBottom)}));
    assert(padding.top<=11&&padding.bottom<=10,`Remapper vertical padding is not compact: ${JSON.stringify(padding)}`);
    await page.locator('.layout-machine-card').click();
    await page.click('.kp-next');
    assert.equal(await page.locator('#remapperListen').evaluate(el=>getComputedStyle(el).borderRadius),'10px');
    await page.locator('#remapperListen .remapper-device-tag').first().click();
    await page.waitForFunction(()=>!document.querySelector('.kp-back').disabled);
    assert.match(await page.locator('.kp-key').first().textContent(),/Pause/);
    assert.match(await page.locator('.kp-key').first().textContent(),/Input: A/);
    assert.match(await page.locator('.kp-key').first().getAttribute('title'),/KEY_A/);
    assert.match(fs.readFileSync('ui/appearance.css','utf8'),/dialog,.confirm-modal,.controller-modal \{ border-radius:10px!important; \}/);
    console.log('PASS: Remapper is compact, uses credential corners, and shows detected assignments');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
