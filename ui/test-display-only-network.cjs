const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const start = source.indexOf('function isIgnoredScanAddress(');
const end = source.indexOf('function localIpv4Addresses(', start);
assert(start >= 0 && end > start, 'Normal-network exclusion helper must exist.');
const context = vm.createContext({});
vm.runInContext(`${source.slice(start, end)};this.ignored=isIgnoredScanAddress;`, context);

assert.equal(context.ignored('10.77.0.1', 'Ethernet'), true);
assert.equal(context.ignored('10.77.0.2', ''), true);
assert.equal(context.ignored('192.168.12.170', 'Wi-Fi'), false);
assert.equal(context.ignored('192.168.12.170', 'Ethernet'), false);
assert.match(source, /10\.77\.0\.0\/24 is reserved exclusively for the user-invoked Ad Hoc Display/);
console.log('PASS: the Ad Hoc display subnet is excluded from discovery and normal transfer routing.');
