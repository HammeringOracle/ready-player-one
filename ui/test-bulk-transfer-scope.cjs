const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert(html.includes('const queueDevice = selectedDevice;') && html.includes('const queueSystem = selectedSystem;'), 'Bulk queues must capture their original machine and console');
assert(html.includes('syncWarehouseSelection(game, { device: queueDevice, system: queueSystem })'), 'Every bulk worker must use its captured scope');
assert(html.includes('const targetDevice = scope.device || selectedDevice;') && html.includes('const targetSystem = scope.system || selectedSystem;'), 'Transfer operations must accept an explicit scope');
assert(html.includes('body: JSON.stringify({ device: targetDevice, system: targetSystem, fileName: name })'), 'Queued transfer requests must use the captured machine and console');
assert(html.includes('if (targetDevice !== selectedDevice || targetSystem !== selectedSystem) return true;'), 'A successful off-screen transfer must continue its original queue');
assert(html.includes('const visibleInTargetPane = targetDevice === selectedDevice && targetSystem === selectedSystem'), 'Another console pane must never suppress an original-console transfer');
assert(server.includes('const misplacedSnes = job.system === "karaoke"'), 'Previously mislabeled SNES transfers must be repaired at startup');
assert(server.includes('system: "snes"'), 'Recovered SNES jobs must return to the SNES queue');

console.log('Bulk transfer scope checks passed.');
