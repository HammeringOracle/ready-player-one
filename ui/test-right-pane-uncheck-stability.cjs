const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'Ready Player One.html'), 'utf8');
assert.match(html, /const optimisticActiveRemovals = new Set\(\)/u);
assert.match(html, /optimisticActiveRemovals\.add\(removalKey\)[\s\S]*checkbox\.checked = false/u,
  'An installed right-pane item must become visibly unchecked before network deletion begins');
assert.match(html, /const removalPending = optimisticActiveRemovals\.has\(removalKey\)/u);
assert.match(html, /removalPending \? "" : " checked"/u,
  'Inventory redraws must preserve the unchecked state while deletion is pending');
assert.doesNotMatch(html, /removalPending \? " disabled"/u,
  'A pending deletion checkbox must remain interactive rather than becoming disabled');
assert.match(html, /if \(optimisticActiveRemovals\.has\(clickedRemovalKey\)\)[\s\S]*checkbox\.checked = false/u,
  'Repeated interaction during deletion must preserve the visible unchecked state');
assert.match(html, /optimisticActiveRemovals\.delete\(removalKey\)[\s\S]*throw error/u,
  'A failed removal must clear optimistic state before restoring the checkbox');
const removalFunction = html.match(/async function removeFromSelectedDevice\(fileName, scope = \{\}\) \{([\s\S]*?)\n    \}\n\n    function bindActiveRemoves/u)?.[1] || '';
assert.ok(removalFunction, 'removeFromSelectedDevice must be present');
assert.doesNotMatch(removalFunction, /if \(!targetOnline\)/u,
  'A stale discovery flag must never silently cancel a requested removal');
assert.match(removalFunction, /fetch\(`\$\{apiBase\}\/api\/roms\/remove`/u,
  'The backend removal endpoint is the authoritative connectivity check');
console.log('Right-pane uncheck remains immediate and stable across inventory refreshes.');
