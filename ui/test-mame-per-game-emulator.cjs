const fs = require('node:fs');
const assert = require('node:assert');

const source = fs.readFileSync(require.resolve('./server.js'), 'utf8');

assert.match(source, /async function configureMameGameEmulator\(device, fileName, preference = "current"\)/);
assert.ok(source.includes('const prefix = `mame["${cleanName}"]`;'));
assert.match(source, /preference === "legacy"/);
assert.match(source, /useLegacy \? "libretro" : "mame"/);
assert.match(source, /useLegacy \? "mame078plus" : "mame"/);
assert.match(source, /system === "mame"[\s\S]{0,180}configureMameGameEmulator\(device, fileName\)/);

console.log('MAME per-game emulator policy is wired into completed uploads.');
