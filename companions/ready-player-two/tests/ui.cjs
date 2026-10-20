const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('C:/Users/EF/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true});
  try {
    for (const viewport of [{width:1920,height:1000},{width:1366,height:650},{width:1060,height:681},{width:1000,height:640},{width:910,height:460},{width:800,height:500},{width:640,height:381}]) {
      const page = await browser.newPage({viewport, deviceScaleFactor:1.5});
      await page.addInitScript(() => {
        window.__TAURI__ = {core:{invoke:async (_, {action,request}) => {
          window.lastRequest = request;
          const folders={retrobat:'C:\\RetroBat',retroarch:'C:\\RetroArch-Win64',esde:'C:\\Users\\Tester\\ROMs',emustation:'C:\\Emu-Station'};
          return action === 'status' ? {ok:true,computer:'DESKTOP-K0GMQ5I',account:'DESKTOP-K0GMQ5I\\Administrator',folder:folders[request.platform],folderExists:true,sharePath:folders[request.platform],networks:{index:1,name:'Wi-Fi',addresses:'192.168.12.6',category:'Private'},access:{AccountName:'Administrator',AccessControlType:'Allow',AccessRight:'Change'}} : {ok:true,account:request.account,paths:'\\\\192.168.12.6\\RetroBat',log:Array.from({length:20},(_,i)=>`Verified step ${i}`)};
        }}};
      });
      await page.goto('file:///' + path.resolve(__dirname,'../frontend/index.html').replaceAll('\\','/'));
      await page.locator('.platform-picker').waitFor({state:'visible'});
      assert.equal(await page.locator('.platform-cards button').count(),4,'Picker must offer all four supported applications');
      assert.equal(await page.evaluate(()=>window.lastRequest),undefined,'No status or setup before platform selection');
      const modalFits=await page.locator('.platform-picker').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;});
      assert.ok(modalFits,'Startup picker must fit the window');
      if(viewport.width===910)await page.screenshot({path:path.resolve(__dirname,'startup-picker.png')});
      await page.locator('[data-choice=retroarch]').click();
      await page.waitForFunction(()=>document.querySelector('#resultTitle').textContent === 'Current status');
      assert.equal(await page.evaluate(()=>window.lastRequest.platform),'retroarch');
      assert.equal(await page.locator('#folder').inputValue(),'C:\\RetroArch-Win64');
      assert.equal(await page.locator('#network option').count(),1);
      await page.locator('#platform').selectOption('esde');
      await page.waitForFunction(()=>window.lastRequest.platform==='esde');
      assert.equal(await page.locator('#folder').inputValue(),'C:\\Users\\Tester\\ROMs');
      await page.locator('#platform').selectOption('emustation');
      await page.waitForFunction(()=>window.lastRequest.platform==='emustation');
      assert.equal(await page.locator('#folder').inputValue(),'C:\\Emu-Station');
      await page.locator('#platform').selectOption('retroarch');
      await page.waitForFunction(()=>!document.querySelector('#setup').disabled);
      assert.equal(await page.locator('#folder').inputValue(),'C:\\RetroArch-Win64');
      await page.locator('#blank').check();
      await page.locator('#setup').click();
      await page.waitForFunction(()=>document.querySelector('#resultTitle').textContent === 'Local setup complete — remote test needed');
      assert.equal(await page.evaluate(()=>window.lastRequest.allowBlankPassword),true);
      assert.equal(await page.evaluate(()=>window.lastRequest.platform),'retroarch');
      await page.locator('#next').click();
      assert.match(await page.locator('#page').textContent(),/^2 /);
      const overflow = await page.evaluate(() => [...document.querySelectorAll('main, section, footer, button, input, select, .warning, .explanation')].filter(el=>{const r=el.getBoundingClientRect();return r.bottom>innerHeight+1||r.right>innerWidth+1;}).map(el=>el.id||el.tagName));
      assert.deepEqual(overflow,[],`Overflow at ${JSON.stringify(viewport)}`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth),false);
      const clipped = await page.evaluate(() => [...document.querySelectorAll('section')].some(section=>[...section.children].some(el=>el.getBoundingClientRect().bottom > section.getBoundingClientRect().bottom + 1)));
      assert.equal(clipped,false,`Section overflow at ${JSON.stringify(viewport)}`);
      if(viewport.width === 910) await page.screenshot({path:path.resolve(__dirname,'compact-layout.png')});
      await page.evaluate(()=>{window.failureCalls=0;window.__TAURI__.core.invoke=async()=>{window.failureCalls++;return {ok:true,shareConfigured:true,loginVerified:false,warning:'Windows rejected the empty password.',paths:['\\\\TEST\\RetroArch'],account:'TEST\\user',log:[]};};});
      await page.locator('#setup').click();
      await page.waitForFunction(()=>document.querySelector('#resultTitle').textContent==='Share configured — login needs attention');
      await page.locator('#setup').click();
      assert.equal(await page.locator('#resultTitle').textContent(),'Empty-password retry blocked');
      assert.equal(await page.evaluate(()=>window.failureCalls),1);
      await page.close();
    }
    console.log('PASS: four platforms, single-object status, blank-password opt-in, log pagination, default/minimum window bounds.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
