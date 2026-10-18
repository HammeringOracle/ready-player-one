// Isolated visual/interaction check. No backend, device discovery or transfers.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'rpo-aero-preview-'));
const source = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, tag => tag.includes('src="ui/appearance.js"') ? tag : '');

(async () => {
  const browser = await chromium.launch({ headless:true,
    ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport:{width:1440,height:900}, reducedMotion:'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://appearance.test') return route.abort();
      if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:source});
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({status:404,body:''});
      const types = {'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'};
      return route.fulfill({contentType:types[path.extname(file)] || 'application/octet-stream',body:fs.readFileSync(file)});
    });
    await page.goto('http://appearance.test');
    await page.evaluate(() => {
      const machines = [['BATOCERA','192.0.2.10','batocera','online selected'],['LAKKA','192.0.2.11','lakka','online'],['BATOCERA USB','E: • Disconnected','batocera-usb','offline']];
      document.getElementById('machineList').innerHTML = machines.map(([name,host,platform,state]) => `<article class="device-card ${state}" data-platform="${platform}"><div class="mini-pc ${platform === 'batocera-usb' ? 'usb-drive' : ''}"></div><div><div class="device-name">${name}</div><div class="device-meta">${host}</div></div></article>`).join('');
      const names = ['1942.zip','1943.zip','720.zip','bubblebobble.zip','contra.zip','digdug.zip','outrun.zip','pacman.zip','simpsons.zip','tmnt.zip'];
      document.getElementById('warehouseList').innerHTML = names.map((name,i) => `<div class="game"><div class="game-head"><input type="checkbox" class="game-check" data-installed="${i<4}" ${i<4?'checked':''}><div class="cover file"></div><div><div class="game-name">${name}</div><div class="game-meta">roms/mame • ${(i+1)*128} KB</div></div><span class="badge">ZIP</span></div></div>`).join('');
      document.getElementById('activeList').innerHTML = names.slice(0,4).map(name => `<div class="device-game"><input type="checkbox" checked><div class="cover file"></div><span>${name}<small>Installed on BATOCERA</small></span><span class="badge">ZIP</span></div>`).join('');
    });
    await page.locator('#appearanceCog').click();
    await page.locator('#openAppearance').click();
    await page.locator('[data-mode=light]').click();
    assert.equal(await page.locator('html').getAttribute('data-appearance'),'light');
    assert.equal(await page.locator('[data-mode=light]').getAttribute('aria-pressed'),'true');
    await page.screenshot({path:path.join(output,'appearance-light.png')});
    await page.locator('dialog[open] .appearance-done').click();
    await page.locator('#settingsTitle').waitFor({state:'visible'});
    await page.screenshot({path:path.join(output,'settings-light.png')});
    await page.locator('dialog[open] .appearance-done').click();
    await page.screenshot({path:path.join(output,'library-light.png')});
    await page.locator('#appearanceCog').click();
    await page.locator('#openAppearance').click();
    await page.locator('.appearance-switch').click();
    assert.equal(await page.locator('html').getAttribute('data-tone'),'neutral');
    await page.setViewportSize({width:1100,height:720});
    await page.screenshot({path:path.join(output,'appearance-light-compact.png')});
    await page.locator('[data-mode=dark]').click();
    assert.equal(await page.locator('html').getAttribute('data-appearance'),'dark');
    await page.screenshot({path:path.join(output,'appearance-dark.png')});
    await page.locator('[data-mode=auto]').click();
    await page.emulateMedia({colorScheme:'light'});
    assert.equal(await page.locator('html').getAttribute('data-appearance'),'light');
    await page.emulateMedia({colorScheme:'dark'});
    await page.waitForFunction(() => document.documentElement.dataset.appearance === 'dark');
    await page.locator('[data-mode=light]').click();
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-appearance'),'light');
    assert.equal(await page.locator('html').getAttribute('data-tone'),'neutral');
    assert.deepEqual(errors,[]);
    console.log('PASS: Settings navigation, Light/Dark/Auto, warmth, persistence, no page errors.');
    console.log('Screenshots: ' + output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
