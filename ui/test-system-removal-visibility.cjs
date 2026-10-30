const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
assert.match(source,
  /const removal = await removeSystem[\s\S]*?current\.visibleSystems = current\.visibleSystems\.filter\(system => system !== body\.system\)[\s\S]*?writeDeviceSettings\(settings\)/,
  'A successful machine-side system removal must atomically remove it from RP1 visibility.');

console.log('Machine-side system removal visibility regression test passed.');
