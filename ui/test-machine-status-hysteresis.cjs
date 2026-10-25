const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert(html.includes('const machineDisconnectGraceMs = 60000;'), 'Confirmed machine cards need a meaningful disconnect grace period');
assert.match(html, /if \(rawOnline \|\| rawReachable\) card\.dataset\.lastConfirmedAt = String\(now\);/, 'Every successful probe must refresh the confirmation time');
assert.match(html, /const reachable = rawReachable \|\| withinDisconnectGrace;/, 'A transient failed probe must retain a yellow reachable card');
assert(!html.includes("card.hidden = !connectedNames.has(card.dataset.device);"), 'A single raw status response must not immediately hide a machine card');
assert(server.includes("isTcpPortOpen(host, 22, 1200)"), 'Fast SSH checks must tolerate a busy Batocera machine');
assert(server.includes("sshServerBanner(host, 1200)"), 'Batocera banner checks must tolerate a busy machine');

console.log('PASS: transient Batocera probe misses no longer remove the RP1 machine card.');
