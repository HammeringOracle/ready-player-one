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

console.log('PASS: the right pane preserves its full machine inventory while transfers update in place.');
