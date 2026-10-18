const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(html, /function updateFooterFromCurrentInventory\(device = selectedDevice, system = selectedSystem\)/, 'Uploads need an immediate console-scoped footer update');
assert.match(html, /const completed = localNames\.reduce\(\(total, fileName\) => total \+ Number\(installed\.has\(fileName\)\), 0\)/, 'The first footer number must equal installed local titles');
assert.match(html, /footerProgressByScope\.set\(scope, \{ completed: stableCompleted, total: localNames\.length, active:/, 'The progress bar must use the stable installed count over the full local-console total');
assert.match(html, /activeNames\.add\(fileName\);\s*updateFooterFromCurrentInventory\(targetDevice, targetSystem\);/, 'Every successful foreground upload must advance its footer immediately');
assert.match(html, /transferInstalledCache = \{ device: "", at: 0, systems: \{\} \};\s*if \(targetDevice !== selectedDevice/, 'Every completed upload must invalidate cached machine inventory, including background consoles');

console.log('Immediate footer increment after upload checks passed.');
