const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
assert.match(source, /xbox360GamerTags:prepared\.gamerTags/, 'Verified GamerTags must be saved in RP1 machine settings.');
assert.match(source, /async function restoreSavedXbox360Profiles[\s\S]*?prepareXbox360Profile\(device, gamerTags\)/, 'Missing profiles must be recreated from saved GamerTags.');
assert.match(source, /body\.system === "xbox360"\) await restoreSavedXbox360Profiles\(body\.device, device\)/, 'Xbox 360 transfers must restore profiles before installing a game.');
assert.match(source, /prepareXbox360XeniaRuntime\(device\)[\s\S]*?restoreSavedXbox360Profiles\(deviceName, device\)/, 'Xbox 360 setup must restore saved profiles on a replacement installation.');

console.log('Xenia GamerTag persistence and restoration regression checks passed.');
