const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert(html.includes('function transferJobsForActivePane()'), 'Transfer rows need a pane-scoped job selector');
assert(
  html.includes("job.device === paneDevice && job.system === paneSystem"),
  'A right-pane transfer must match both the pane machine and pane console'
);
assert(
  html.includes('transferDisplayJobs.get(pendingResetScope(paneDevice, paneSystem))'),
  'Live right-pane transfer state must be stored under a machine-and-console scope'
);
assert(
  html.includes('if (paneDevice !== selectedDevice || paneSystem !== selectedSystem) return [];'),
  'A stale status refresh must not paint into a pane after a machine or console switch'
);
assert(
  html.includes('activeList.dataset.system = key;\n        clearActiveTransferRows();'),
  'Switching consoles must clear old transfer rows and progress decorations immediately'
);
assert(
  html.includes('transferDisplayJobs.delete(nextActiveScope);'),
  'Entering a console must discard any cached transfer snapshot before its fresh status arrives'
);

console.log('Transfer pane scope checks passed.');
