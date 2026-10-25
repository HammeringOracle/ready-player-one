const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(html, /remoteLibrarySnapshotStoragePrefix/u,
  'The last confirmed machine inventory must survive an RP1 restart.');
assert.match(html, /const snapshot = readRemoteLibrarySnapshot\(requestScope\)/u,
  'The right pane must restore its complete scoped inventory before polling.');
assert.match(html, /saveRemoteLibrarySnapshot\(requestScope, displayItems\)/u,
  'Successful inventory reads must replace the durable snapshot.');
assert.match(html, /updateRemoteLibrarySnapshot\(targetDevice, targetSystem, fileName, confirmedItem\)/u,
  'Completed uploads must be merged into the scoped inventory immediately.');
assert.match(html, /updateRemoteLibrarySnapshot\(targetDevice, targetSystem, fileName\);/u,
  'Completed removals must be removed from the scoped inventory immediately.');
assert.match(html, /const existing = \[\.\.\.activeList\.querySelectorAll\('\.device-game'\)\]\.find/u,
  'Transfer progress must decorate existing inventory rows before creating placeholders.');
assert.match(html, /const savedSelections = readDeviceTransferSelections\(selectedDevice\);[\s\S]*?const selectedNames = new Set/u,
  'The right pane must render the complete saved console queue, not only active workers.');
assert.match(html, /\.device-game:not\(\[data-transfer-placeholder\]\)/u,
  'Installed inventory rows must remain distinct from waiting transfer rows.');
assert.match(html, /row\.className = 'device-game transfer-queued'/u,
  'Every waiting ROM must receive a stable right-pane row before its worker starts.');
assert.doesNotMatch(html, /querySelectorAll\('\[data-transfer-placeholder\]'\)\.forEach\(row => row\.remove\(\)\)/u,
  'Polling must not destroy and rebuild the complete waiting list.');
assert.match(html, /if \(rowsChanged \|\| jobs\.length\) sortActiveGameRows\(\);/u,
  'The combined installed, active, and waiting list must remain naturally sorted.');

console.log('PASS: the right pane preserves its full machine inventory while transfers update in place.');
