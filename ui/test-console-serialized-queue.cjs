const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.resolve(__dirname, 'server.js'), 'utf8');
assert.match(html, /\/api\/transfers\/enqueue/u, 'Frontend selections must use the durable queue');
assert.match(html, /const queuedUploadingSystems = new Set/u, 'Queued consoles must be rendered separately from active transfers');
assert.match(html, /console-transfer-queued/u, 'Queued consoles need their dashed-circle state');
assert.match(server, /const requestedConcurrency = useSmallPool \? 10 : 4/u,
  'The active console must retain the ten-small/four-large transfer rule');
assert.match(server, /configuredSshConcurrency === 1/u,
  'A machine that rejects parallel SSH streams must retain its saved safe single-stream override');
assert.match(server, /const dispatchBatch = selectedPool\.slice\(0, available\)/u,
  'The dispatcher must fill every available 4/10 slot');
assert.match(server, /const activeQueuedTransferSystem = new Map\(\)/u, 'The dispatcher must remember which console owns the machine');
assert.match(server, /const consoleQueue = queued\s*\.filter\(job => job\.system === selectedSystem\)/u,
  'The dispatcher must drain the active console before selecting another');
console.log('Serialized per-machine, console-at-a-time queue checks passed.');
