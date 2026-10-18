const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const bindStart = html.indexOf('function bindActiveRemoves()');
const bindEnd = html.indexOf('applyVisibleSystems(readVisibleSystems());', bindStart);
const bindActiveRemoves = html.slice(bindStart, bindEnd);

assert(!bindActiveRemoves.includes('row.hidden = true;'), 'The right-pane row must remain visible while its deletion is running');
assert(bindActiveRemoves.includes('await removeFromSelectedDevice(fileName);'), 'Unchecking an installed game must await its visible deletion workflow');
assert(bindActiveRemoves.includes('checkbox.checked = true;'), 'A failed remote delete must restore the checked state');
assert(
  !bindActiveRemoves.slice(0, bindActiveRemoves.indexOf('activeList.querySelectorAll(".device-game .active-track-check")')).includes('{ once: true }'),
  'A restored row must remain removable after a failed delete attempt'
);

console.log('Visible right-pane removal checks passed.');
