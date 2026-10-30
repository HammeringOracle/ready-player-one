const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'Ready Player One.html'), 'utf8');
assert.match(html, /reconnectRetries\.v2/u, 'Old unscoped reconnect retries must be discarded');
assert.match(html, /machineIdentity: deviceStorageIdentity\(device\)/u,
  'A reconnect retry must belong to the exact machine installation that requested it');
assert.match(html, /Date\.now\(\) - Number\(item\.requestedAt\) > 30 \* 60 \* 1000/u,
  'Reconnect authorization must expire instead of starting games much later');
assert.match(html, /reconnectRetryDevicesRunning\.has\(item\.device\)/u,
  'Only one reconnect retry may run on a machine at a time');
assert.match(html, /reconnectRetryDevicesRunning\.delete\(item\.device\)/u,
  'The per-machine reconnect slot must always be released');
console.log('Reconnect retry scope and concurrency checks passed.');
