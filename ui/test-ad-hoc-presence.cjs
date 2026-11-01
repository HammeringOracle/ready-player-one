const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const start = source.indexOf('async function decorateAdHocDisplayPresence(');
const end = source.indexOf('function markRemoteDisplayPairingVerified(', start);
assert(start >= 0 && end > start, 'Ad Hoc presence decorator must exist.');

let directProbeCount = 0;
let directReachable = true;
const context = vm.createContext({
  verifiedRemoteDisplayDevice: () => 'Batocera 2',
  isTcpPortOpen: async () => { directProbeCount += 1; return directReachable; }
});
vm.runInContext(`${source.slice(start, end)};this.decorate=decorateAdHocDisplayPresence;`, context);

(async () => {
  const normal = await context.decorate({'Batocera 2': {online:true, reachable:true, checks:{ssh:true}, adHocDisplay:true}});
  assert.equal(normal['Batocera 2'].adHocDisplay, undefined, 'Normal Wi-Fi/LAN must suppress the magenta fallback.');
  assert.equal(normal['Batocera 2'].directDisplayConfigured, true, 'A verified direct display remains remembered for the Ethernet symbol.');
  assert.equal(normal['Batocera 2'].directDisplayConnected, true, 'The display cable remains independently visible while Wi-Fi is active.');
  assert.equal(directProbeCount, 1, 'Presence may be probed without initiating Ad Hoc Display.');

  const fallback = await context.decorate({'Batocera 2': {online:false, reachable:false, checks:{ssh:false,smb:false,web:false}}});
  assert.equal(fallback['Batocera 2'].adHocDisplay, true, 'Direct-only reachability must expose the magenta fallback.');
  assert.equal(fallback['Batocera 2'].adHocDisplayHost, '10.77.0.2');
  assert.equal(directProbeCount, 2);
  directReachable = false;
  const sleeping = await context.decorate({'Batocera 2': {online:true, reachable:true, checks:{ssh:true}}});
  assert.equal(sleeping['Batocera 2'].directDisplayConnected, false);
  assert.equal(sleeping['Batocera 2'].directDisplayConfigured, true, 'The Ethernet symbol must survive a sleeping direct interface.');
  assert.equal(sleeping['Batocera 2'].adHocDisplay, undefined, 'A remembered but unreachable cable must never trigger magenta.');
  console.log('PASS: magenta appears only for direct-only fallback presence and never initiates Ad Hoc Display.');
})().catch(error => { console.error(error); process.exitCode = 1; });
