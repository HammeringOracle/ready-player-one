const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const addStart = html.indexOf('async function addToSelectedDevice(fileName, type, scope = {})');
const addEnd = html.indexOf('async function removeFromSelectedDevice', addStart);
const addBody = html.slice(addStart, addEnd);

assert(addStart >= 0 && addEnd > addStart, 'The add-to-device handler must exist');
assert(!addBody.includes('if (!targetOnline)'), 'A cached discovery status must not block an upload before the backend creates its job');
assert(addBody.includes("fetch(`${apiBase}/api/roms/add`"), 'The backend upload endpoint must authoritatively start the transfer');
assert(html.includes('if (!started) {\n            clearOptimisticConsoleTransfer(targetDevice, targetSystem);'), 'A rejected transfer start must clear its optimistic console spinner');

console.log('PASS: stale discovery status cannot create a spinner-only transfer.');
