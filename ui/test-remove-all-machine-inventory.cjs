const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(html, /async function runConsoleRemoveAll\(device, system\)/, 'Remove All needs a dedicated machine-console operation');
assert.match(html, /\/api\/active\?device=.*?system=/, 'Remove All must read the actual machine inventory');
assert.match(html, /selections\[system\] = \[\]/, 'Remove All must clear the saved queue for that console');
assert.match(html, /function clearRemovedConsoleSelectionState\(device, system\)/, 'Remove All needs one console-scoped UI reset');
assert.match(html, /transferDisplayJobs\.delete\(scope\)/, 'Successful Remove All must clear stale transfer rows for that console');
assert.match(html, /saveRemoteLibrarySnapshot\(scope, \[\]\)/, 'Successful Remove All must clear the cached machine list for that console');
assert.match(html, /checkbox\.checked = false/, 'Successful Remove All must visibly clear each game checkbox');
assert.match(html, /clearRemovedConsoleSelectionState\(device, system\);[\s\S]*?finishFooterRemoval\(true\)/, 'An already-empty machine must also clear the Remove All checkbox');
assert.match(html, /job\.device === device && job\.system === system && !job\.running && !job\.completed/, 'Remove All must discard stopped resume records for that console');
assert.match(html, /beginFooterRemoval\(names\.length, device, system\)/, 'Reverse footer progress must use the machine inventory count');
assert.match(html, /await runConsoleRemoveAll\(selectedDevice, selectedSystem\)/, 'Both Remove All confirmation paths must use the authoritative operation');

console.log('Machine-authoritative Remove All checks passed.');
