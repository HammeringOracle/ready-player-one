const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(html, /function completeFooterRemoval\(device = selectedDevice, system = selectedSystem\)/, 'Removal completion must identify its machine and console');
assert.match(html, /footerRemovalProgress\.device !== device \|\| footerRemovalProgress\.system !== system/, 'Another console must not advance the current removal counter');
assert.match(html, /if \(device === selectedDevice && system === selectedSystem\) \{\s*paintFooterRemovalProgress/, 'A background console removal must not repaint the visible footer');
assert.match(html, /completeFooterRemoval\(targetDevice, targetSystem\)/, 'Each deletion must update only its own footer scope');
assert.match(html, /const finished = footerRemovalProgress;/, 'Removal cleanup must retain the completed operation scope across its delay');
assert.match(html, /footerProgressByScope\.set\(footerProgressScope\(device, system\), \{ completed: 0, total: localTotal, active: false \}\)/, 'Successful Remove All must settle at zero installed out of the full local-console total');

console.log('Removal footer machine-console isolation checks passed.');
