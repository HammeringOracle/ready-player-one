const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const create=require('./keypad');
(async()=>{
 const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'rp1-ps4-'));
 let last;
 const api=create({root,getRuntimeDevice:async()=>({host:'test',access:'ssh'}),execSsh:async(_,command)=>{
  const encoded=command.match(/sys.argv=\["keypad",zlib.decompress\(base64.b64decode\("([^"]+)"/)[1];
  last=JSON.parse(zlib.inflateSync(Buffer.from(encoded,'base64')));
  return JSON.stringify(last.action==='learn'?{name:'Wireless Controller',key:'D-pad',codes:[16],eventType:'abs',direction:1}:{installed:true,mappings:[]});
 }});
 const learned=await api({action:'learn',device:'test',deviceType:'ps4'});
 await api({action:'apply',device:'test',deviceType:'ps4',mappings:[{slot:17,token:learned.token,action:'key:KEY_RIGHT'}]});
 assert.equal(last.mappings[0].eventType,'abs');
 assert.match(zlib.inflateSync(Buffer.from(last.bridge,'base64')).toString(),/recroom-ps4/);
 assert.equal((await api({action:'load',device:'test',deviceType:'ps4'})).mappings[0].slot,17);
 assert.equal((await api({action:'load',device:'test'})).mappings.length,0);
 const {chromium}=require('C:/Users/EF/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1000}});const calls=[];
  await page.route('http://ps4.test/**',route=>{
   if(route.request().url().endsWith('/api/keypad')){
    const b=route.request().postDataJSON();calls.push(b);
    return route.fulfill({json:b.action==='learn'?{ok:true,name:'Wireless Controller',key:'BTN_SOUTH',codes:[304],token:'test'}:{ok:true,devices:[],mappings:[],installed:b.action==='apply'}});
   }
   return route.fulfill({contentType:'text/html',body:'<div id="advancedFeatures"><button id="advancedToggle"></button><button id="openKeypad">Open</button></div>'});
  });
  await page.goto('http://ps4.test');await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'keypad-ui.js'),'utf8')});
  await page.evaluate(()=>window.getDiscoveredMachineStatuses=()=>({one:{online:true,platform:'batocera',displayName:'Test'}}));
  await page.click('#openKeypad');await page.click('.layout-machine-card');await page.click('.kp-next');
  await page.getByRole('button',{name:'PS4 Controller',exact:true}).click();
  await page.waitForSelector('.kp-ps4 .kp-key');assert.equal(await page.locator('.kp-key').count(),18);
  assert.equal(calls.some(c=>c.action==='learn'),false);
  await page.locator('.kp-key').nth(2).click({button:'right'});await page.click('.kp-functions-open');
  await page.getByRole('button',{name:/Exit Emulator/}).click();
  await page.locator('.kp-key').nth(2).click();await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.click('.kp-next');await page.waitForFunction(()=>document.querySelector('.kp-status').textContent.includes('Installed.'));
  assert.equal(calls.find(c=>c.action==='apply').deviceType,'ps4');
  assert.equal(calls.find(c=>c.action==='save').slots.length,18);
  await page.screenshot({path:path.join(root,'ps4-layout.png')});
  console.log('PS4 profile isolation, D-pad preservation, tag bypass, 18-control editor, learn and apply passed. Screenshot: '+path.join(root,'ps4-layout.png'));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
