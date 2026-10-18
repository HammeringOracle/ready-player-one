const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert(html.includes('const selectedJobs = jobs.filter(job => job.device === requestDevice);'));
assert(html.includes('transferDisplayJobs.set(pendingResetScope(requestDevice, requestSystem), selectedJobs.filter(job =>'));
assert(html.includes('if (requestDevice !== selectedDevice || requestSystem !== selectedSystem) return;'));
assert(html.includes('job.system === requestSystem && job.running && !job.completed'));
assert(html.includes('const completedKeys = new Set(selectedJobs'));
assert(html.includes('const visibleJobs = selectedJobs'));
assert(html.includes('const completedJobKeys = new Set(selectedJobs'));
assert(html.includes("activeList.dataset.device !== selectedDevice || activeList.dataset.system !== selectedSystem"));
assert(html.includes("job.device === selectedDevice && job.system === selectedSystem"));
assert(html.includes("activeList.dataset.system = key;"));

console.log('Machine-specific transfer display isolation checks passed.');
