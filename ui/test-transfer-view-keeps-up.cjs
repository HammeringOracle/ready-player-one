const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('Ready Player One.html', 'utf8');
const start = html.indexOf('async function refreshTransferActivity()');
const end = html.indexOf('\n    function machineDisplayName', start);
const source = html.slice(start, end);

assert(start >= 0 && end > start, 'shared transfer refresh exists');
assert.match(html, /let transferActivityRefreshQueued = false/, 'overlapping refresh intent is retained');
assert.match(source, /if \(transferActivityRefreshing\) \{[\s\S]*transferActivityRefreshQueued = true;[\s\S]*return;/, 'a busy refresh queues the newest repaint');
assert.match(source, /finally \{[\s\S]*transferActivityRefreshing = false;[\s\S]*if \(transferActivityRefreshQueued\) queueMicrotask\(refreshTransferActivity\)/, 'the queued repaint runs immediately after the active request');
assert.match(html, /setInterval\(refreshTransferActivity, 750\)/, 'all consoles poll visible progress responsively');
assert.match(source, /transferDisplayJobs\.set\(pendingResetScope\(requestDevice, requestSystem\)/, 'the shared refresh updates the selected machine and console scope');

console.log('PASS: every console coalesces transfer status updates without dropping the latest right-pane repaint.');
