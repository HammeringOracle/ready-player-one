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
assert.doesNotMatch(server, /configuredSshConcurrency === 1/u,
  'A transient SSH failure must not permanently force the machine into single-stream mode');
assert.match(server, /const available = Math\.max\(0, requestedConcurrency - activeConsoleSlots\.length\)/u,
  'Copy All must immediately fill the normal ten-small/four-large pool');
assert.match(server, /const dispatchBatch = selectedPool\.slice\(0, available\)/u,
  'The dispatcher must fill every available 4/10 slot');
assert.match(server, /const activeQueuedTransferSystem = new Map\(\)/u, 'The dispatcher must remember which console owns the machine');
assert.match(server, /const consoleQueue = queued\s*\.filter\(job => job\.system === selectedSystem\)/u,
  'The dispatcher must drain the active console before selecting another');
assert.match(server, /activeDedicatedSshHosts\.get\(device\.host\)[\s\S]*?deferred:true, items:null/u,
  'Library polling must defer instead of competing with active ROM SSH channels');
assert.match(html, /if \(result\.deferred\)[\s\S]*?renderPendingTransfers\(\)[\s\S]*?scheduleActiveInventoryReconcile/u,
  'A deferred inventory read must preserve the confirmed pane and live transfer rows');
assert.match(server, /getRuntimeDevice\(body\.device, \{skipConnectionProbe:true\}\)/u,
  'Copy All enqueue must not wait on a redundant reachability socket');
assert.match(server, /concurrency: fileSize > 50 \* 1024 \* 1024 \? 8 : 3/u,
  'Large disc images must use the bounded eight-write SFTP pipeline');
assert.match(server, /readyTimeout: 30000/u,
  'A loaded Batocera SSH handshake must not be aborted by an aggressive timeout');
assert.match(server, /queueSshAuthentication\(device\.host, connectUpload\)/u,
  'Concurrent ROMs must stagger independent SSH authentication per machine');
assert.match(server, /setTimeout\(releaseAuthentication, 350\)/u,
  'Batocera must receive a quiet interval between concurrent SSH logins');
console.log('Serialized per-machine, console-at-a-time queue checks passed.');
