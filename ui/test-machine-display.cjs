const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(html, /xeniaProfileButton[\s\S]*displayButton\.textContent = 'Display'/u, 'Display must sit below the Xenia profile item');
assert.match(html, /<strong style="display:block">Performance HUD<\/strong>/u, 'Display panel must contain the HUD checkbox');
assert.match(html, /checkbox\.addEventListener\('change'/u, 'HUD must save as soon as its checkbox changes');
assert.match(html, /Exit and relaunch the current game to display it/u, 'Running games must report the MangoHud relaunch requirement');
assert.match(server, /setBatoceraSetting\(config, "global\.hud", "perf"\)/u, 'Batocera performance HUD must use global.hud=perf');
assert.match(server, /url\.pathname === "\/api\/machine-display"/u, 'Machine Display API must exist');
assert.match(server, /This machine does not expose a compatible performance HUD/u, 'Unsupported machines must be rejected');
console.log('Machine Display HUD controls passed.');
