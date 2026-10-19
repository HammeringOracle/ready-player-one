const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('Ready Player One.html', 'utf8');

assert.match(html, /function promoteCompletedTransferToActiveList\(job\)/,
  'completed transfers must be promoted directly into the right-pane inventory');
assert.match(html, /completedForOpenPane\.forEach\(promoteCompletedTransferToActiveList\)/,
  'each newly completed transfer must be promoted live');
assert.match(html, /scheduleActiveInventoryReconcile\(requestDevice, requestSystem\)/,
  'live promotion must be reconciled with the remote inventory after it settles');
assert.doesNotMatch(html, /if \(newlyCompleted\.some\([\s\S]{0,180}loadActiveList\(selectedSystem\)/,
  'completion must not disappear behind an immediate, potentially stale remote reload');

console.log('live completed-transfer inventory checks passed');
