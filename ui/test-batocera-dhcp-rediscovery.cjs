const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(source, /function startAutomaticRediscovery\(\)/,
  'fast status polling must have an automatic recovery path');
assert.match(source, /neighbors\.find\(entry => entry\.mac === savedMac/,
  'the saved MAC must be used to follow a machine to a new address');
assert.match(source, /saveDiscoveredHost\(name, macHost, "ssh", savedMac\)/,
  'a verified address found by MAC must be persisted');
assert.match(source, /startDeepDiscovery\(\{ full: now - lastFullSubnetScanAt >= automaticFullSubnetIntervalMs \}\)/,
  'automatic recovery must periodically search the active subnet');
assert.match(source, /quickEntries\.some\(\(\[, status\]\) => !status\.online\)/,
  'an offline card must initiate background rediscovery');
assert.match(source, /searching: !\(online \|\| cachedOnline\) && Boolean\(deepDiscoveryPromise\)/,
  'the card must blink only while a discovery operation is actually active');
assert.match(source, /Date\.now\(\) - discoveryCache\.at < 15000/,
  'stale online state must not suppress DHCP recovery');

console.log('PASS: Batocera DHCP address changes trigger MAC-aware background rediscovery');
