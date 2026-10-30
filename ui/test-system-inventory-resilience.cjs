const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert(html.includes('/api/device/systems?device=${encodeURIComponent(device)}`, 90000'),
  'Machine system reconciliation must allow slow Batocera startup to finish.');
assert(html.includes("timeoutError.name = 'AbortError';"),
  'Timeouts must use the classification already handled silently by inventory refresh.');
assert(!html.includes("showLibraryConnectionMessage(error.message || 'Unable to read this machine’s systems.')"),
  'Raw backend diagnostics must not be painted into the systems pane.');
assert(server.includes('using ROM folders:'),
  'Batocera system discovery must log and recover from a missing local API.');
assert(server.includes('find /userdata/roms -mindepth 1 -maxdepth 1 -type d -printf'),
  'System discovery must fall back to durable ROM directories.');

console.log('System inventory timeout and Batocera API fallback checks passed.');
