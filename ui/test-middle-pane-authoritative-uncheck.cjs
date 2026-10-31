const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const start = html.indexOf('async function syncWarehouseSelection');
const end = html.indexOf('async function addToSelectedDevice', start);
const sync = html.slice(start, end);

assert.ok(start >= 0 && end > start, 'middle-pane selection handler must exist');
assert.match(sync, /if \(transferIsPending[\s\S]*?await removeFromSelectedDevice\(name, \{ device: targetDevice, system: targetSystem \}\)/u,
  'pending middle-pane unchecks must atomically cancel and remove the machine file');
const pendingBranch = sync.match(/if \(transferIsPending[\s\S]*?return true;\s*\}/u)?.[0] || '';
assert.doesNotMatch(pendingBranch, /api\/transfers\/(?:stop|dismiss)/u,
  'middle-pane unchecks must not stop or dismiss without deleting the installed file');

console.log('PASS: middle-pane uncheck always reconciles the machine inventory through atomic removal.');
