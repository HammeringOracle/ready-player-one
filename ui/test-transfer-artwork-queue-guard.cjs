const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(html, /\.footer \.sync-status \{ display: none; \}/u, 'footer must never display transfer filenames');
assert.match(html, /job\.running \|\| Number\(job\.percent \|\| 0\) < 100/u, '100% ROM jobs must stay pending while artwork is running');
assert.match(html, /automaticResumeRunningDevices\.has\(selectedDevice\)/u, 'normal queue must not compete with startup resume');
assert.match(html, /await resumeGroup\(small, 10\);[\s\S]*await resumeGroup\(large, 4\);/u, 'small and large worker groups must run sequentially');

console.log('Transfer artwork queue guard and filename-free footer checks passed.');
