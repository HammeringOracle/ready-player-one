const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(html, /removeFromSelectedDevice\(fileName, \{ device, system, deferStorageRefresh: true \}\)/, 'Bulk removal must defer per-file storage polling');
assert.match(html, /await Promise\.all\([\s\S]*?if \(device === selectedDevice\) await loadDeviceStorage\(\);/, 'Remove All must refresh free space once after its deletion workers finish');
assert.match(html, /if \(targetDevice === selectedDevice\) \{[\s\S]*?if \(badge && result\.storage\)[\s\S]*?badge\.textContent = result\.storage\.display/, 'Every completed removal, including Remove All workers, must immediately display its returned free-space value');
assert.match(html, /if \(!scope\.deferStorageRefresh\) \{[\s\S]*?await loadDeviceStorage\(\);[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?loadDeviceStorage\(\);/, 'A single deletion must verify the settled free-space value with follow-up network reads');
assert.match(html, /function beginLiveRemovalStorage\(device\)[\s\S]*?setInterval\(async \(\) => \{[\s\S]*?await loadDeviceStorage\(\)[\s\S]*?\}, 600\)/, 'Free space must be polled live while deletion is active');
assert.match(html, /beginLiveRemovalStorage\(targetDevice\)[\s\S]*?endLiveRemovalStorage\(targetDevice\)/, 'Every removal must start and stop its machine-scoped live storage watcher');

console.log('Storage refresh after removal checks passed.');
