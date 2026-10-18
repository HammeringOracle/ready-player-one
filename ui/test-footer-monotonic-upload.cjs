const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(html, /const consoleTransfersActive = consoleJobs\.some\(job => job\.running\) \|\| consoleQueuedItems\.length > 0;/, 'Queued additions must keep the console progress session active between files');
assert.match(html, /const stableMovedFiles = \(consoleTransfersActive \|\| previousFooter\.active\)[\s\S]*?Math\.max\(Number\(previousFooter\.completed \|\| 0\), movedFiles\)/, 'Stale inventory must never lower active upload progress');
assert.match(html, /const stableCompleted = previous\.active[\s\S]*?Math\.max\(Number\(previous\.completed \|\| 0\), completed\)/, 'A live-list refresh must not undo an immediate upload increment');
assert.match(html, /function beginFooterRemoval\(/, 'Removal retains its independent reverse-progress path');

console.log('monotonic footer upload checks passed');
