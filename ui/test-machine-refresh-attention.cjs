const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert(html.includes('.find-machines:is(.finding,.awaiting-machine)'), 'The refresh pulse and arrow must share the yellow no-machine state');
assert.match(html, /function syncFindMachinesWaitingState\(\)[\s\S]*?querySelectorAll\('\.device-card'\)[\s\S]*?classList\.toggle\('awaiting-machine', !hasVisibleMachine\)/, 'The attention state must follow visible machine tags');
assert.match(html, /new MutationObserver\(syncFindMachinesWaitingState\)\.observe\(machineList,[\s\S]*?attributeFilter: \['hidden'\]/, 'Created, hidden, and revealed machine tags must update attention automatically');
assert.match(html, /deviceCards = machineList\.querySelectorAll\("\.device-card"\);\s*syncFindMachinesWaitingState\(\);/, 'Every discovery reconciliation must update the header button');

console.log('PASS: the refresh button stays yellow and pulsing until a machine tag is visible.');
