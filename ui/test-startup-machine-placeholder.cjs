const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const machineListStart = html.indexOf('<div class="machine-list" id="machineList">');
const machineListEnd = html.indexOf('</div>\n      <div class="advanced-features"', machineListStart);
const machineList = html.slice(machineListStart, machineListEnd);
const syncStart = html.indexOf('function syncDeviceCards(statuses)');
const syncEnd = html.indexOf('function selectDeviceCard', syncStart);
const syncBlock = html.slice(syncStart, syncEnd);

assert.match(machineList, /class="device-card checking-placeholder" data-placeholder="checking"/);
assert.match(machineList, /<div class="device-name">Checking\.\.\.<\/div>/);
assert.match(machineList, /<div class="device-meta">Looking for IP\.\.\.<\/div>/);
assert.doesNotMatch(machineList, /data-placeholder="checking"[^>]*hidden/);
assert.match(syncBlock, /querySelector\('\.device-card\[data-placeholder="checking"\]'\)\?\.remove\(\)/);

console.log('PASS: startup immediately shows a Checking placeholder and removes it after discovery returns.');
