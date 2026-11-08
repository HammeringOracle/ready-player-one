const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(server, /normalHostCandidates = \[\.\.\.new Set\(\[/);
assert.match(server, /filter\(host => host && host !== "10\.77\.0\.2"\)/);
assert.match(server, /normalHostChecks\.some\(check => check\.reachable\)/);
assert.match(server, /if \(verifiedNormalHost\) normalStatus\.wifiHost = verifiedNormalHost;/);

console.log('Machine card gives verified Wi-Fi priority over the ad-hoc display link.');
