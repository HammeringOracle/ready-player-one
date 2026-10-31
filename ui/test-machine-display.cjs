const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(html, /remoteDisplayButton\.textContent = 'Display'/u, 'Display must remain in the machine context menu');
assert.match(html, /controlRow\('Global Performance OSD'/u, 'OSD must expose the global HUD setting');
assert.match(html, /controlRow\('Xenia MangoHud Support'/u, 'OSD must expose Xenia HUD support independently');
assert.match(html, /controlRow\('Xbox 360 Bezel'/u, 'OSD must expose the Xbox 360 bezel setting');
assert.match(html, /allControls\.forEach\(control => control\.addEventListener\('change',saveSettings\)\)/u, 'each OSD setting must save as soon as it changes');
assert.match(html, /Saved\. Exit and relaunch the current game/u, 'running games must report the relaunch requirement');
assert.match(server, /setBatoceraSetting\(config, "global\.hud", "perf"\)/u, 'Batocera performance HUD must use global.hud=perf');
assert.match(server, /typeof values\.globalHud === "boolean"[\s\S]*typeof values\.xeniaHudSupport === "boolean"[\s\S]*typeof values\.xbox360Bezel === "string"/u, 'backend must accept all three settings independently');
assert.match(server, /xbox360Bezel: xbox360Bezel === "none" \? "none" : "default"/u, 'backend must return the live bezel mode');
assert.match(server, /url\.pathname === "\/api\/machine-display"/u, 'Machine Display API must exist');
assert.match(server, /This machine does not expose a compatible performance HUD/u, 'Unsupported machines must be rejected');
console.log('Machine Display HUD controls passed.');
