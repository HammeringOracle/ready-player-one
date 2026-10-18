const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.doesNotMatch(html, /while \(automaticResumeRunningDevices\.has\(queueDevice\)\)/, 'A new console queue must not wait for every unrelated automatic resume');
assert.match(html, /runningOnMachine = \(status\.jobs \|\| \[\]\)\.filter\(job => job\.device === queueDevice && job\.running\)\.length/, 'Bulk upload must account for transfers already running on the machine');
assert.match(html, /Math\.max\(1, concurrency - runningOnMachine\)/, 'Bulk upload must use only the remaining machine transfer capacity');
assert.doesNotMatch(html, /warehouseBulkChanging \|\| automaticResumeRunningDevices\.has\(selectedDevice\)/, 'Saved selections must continue while unrelated automatic resumes run');

console.log('Bulk upload shared-capacity checks passed.');
