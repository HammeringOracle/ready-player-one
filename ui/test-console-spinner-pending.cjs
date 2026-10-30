const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'Ready Player One.html'), 'utf8');
assert.doesNotMatch(html, /for \(const system of new Set\(selectedJobs[\s\S]{0,240}optimisticUploadingSystems\.delete/u,
  'Historical jobs must not clear a whole console spinner');
assert.match(html, /let stillPending = \[\.\.\.pendingTransferKeys\]\.some\(item => item\.startsWith\(prefix\)\)/u);
assert.match(html, /const stillRunning = selectedJobs\.some\(job => job\.system === system && job\.running/u);
assert.match(html, /if \(!stillPending && !stillRunning\) optimisticUploadingSystems\.delete\(key\)/u);
assert.match(html, /const unobservedPendingConsoleSince = new Map\(\)/u,
  'Pending console state must track how long it remains absent from backend jobs');
assert.match(html, /Date\.now\(\) - firstUnobserved >= 15000[\s\S]*?pendingTransferKeys\.delete\(pendingKey\)/u,
  'An abandoned pending request must eventually clear its console spinner');
assert.match(html, /job\.running \|\| job\.completed \|\| job\.dispatching \|\| job\.autoQueued \|\| job\.queuedAt/u,
  'Durably queued jobs must replace optimistic pending state');
assert.doesNotMatch(html, /stillPending && !backendObservedConsole && !stillRunning/u,
  'Historical jobs must not hold a drained console spinner open');
console.log('Console spinner persists from click through queue wait and active transfer.');
