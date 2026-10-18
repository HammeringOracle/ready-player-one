const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const calls = html.match(/setTimeout\(continueWarehouseSelectionQueue, 0\)/g) || [];

assert.equal(calls.length, 1, 'Only an explicitly confirmed bulk operation may continue its own saved queue');
assert.doesNotMatch(html, /automaticResumeRunningDevices\.delete\(device\);\s*if \(device === selectedDevice\) setTimeout\(continueWarehouseSelectionQueue/, 'Finishing resume must not launch unrelated saved selections');
assert.doesNotMatch(html, /remoteLibrarySnapshots\.set\(requestScope, displayItems\);[\s\S]{0,500}setTimeout\(continueWarehouseSelectionQueue/, 'Opening or refreshing a console must not launch its saved selections');
assert.match(html, /saved\.gamecube = \[\]/, 'The obsolete GameCube view-triggered queue must be cleared once');
assert.match(html, /readyPlayerOne\.gamecubeQueueCleanup\.v1/, 'The GameCube cleanup must be a one-time per-machine migration');

console.log('Saved selections cannot auto-start merely by viewing a console.');
