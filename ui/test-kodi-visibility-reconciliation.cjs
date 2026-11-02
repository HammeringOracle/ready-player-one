const assert = require('assert');
const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert(server.includes('systems.includes("kodi") && !reconciledVisibleSystems.includes("kodi")'),
  'A live Kodi console must repair a stale unchecked RP1 checkbox');
assert(server.includes('reconciledVisibleSystems.push("kodi")'),
  'Kodi must be added to the reconciled visible systems');
assert(server.includes('visibleSystems: reconciledVisibleSystems'),
  'The repaired Kodi visibility must be persisted for the machine');

console.log('Kodi visibility reconciliation checks passed.');
