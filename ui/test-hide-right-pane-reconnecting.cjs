const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const start = html.indexOf('function showLibraryConnectionMessage(message)');
const end = html.indexOf('function scheduleActiveListRetry', start);
const block = html.slice(start, end);
assert.match(block, /const loading = message\.startsWith\("Loading"\)/);
assert.match(block, /const waiting = message\.startsWith\("Waiting for this machine"\)/);
assert.match(block, /if \(reconnecting \|\| loading \|\| waiting\) \{\s*clearLibraryConnectionMessage\(\);\s*return;/);
assert.match(block, /The machine card communicates discovery, loading, and waiting state/);
console.log('PASS: right pane suppresses redundant discovery, loading, and waiting notices.');
