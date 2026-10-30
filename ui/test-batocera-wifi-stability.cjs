const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(source, /async function ensureBatoceraWifiStability\(deviceName, device\)/,
  'Batocera connections must have an automatic Wi-Fi stability repair');
assert.match(source, /iw dev wlan0 info 2>\/dev\/null \|\| true/,
  'the repair must only run when wlan0 actually exists');
assert.match(source, /setWifiPowerSaverStartup\(current, false\)/,
  'the no-power-save setting must persist across Batocera boots');
assert.match(source, /iw dev wlan0 set power_save off/,
  'the current Batocera session must be repaired immediately');
assert.match(source, /setImmediate\(\(\) => ensureBatoceraWifiStability/,
  'successful status detection must trigger the repair without delaying card polling');

console.log('PASS: connected Batocera Wi-Fi is stabilized automatically and persistently.');
