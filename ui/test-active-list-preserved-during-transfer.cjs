const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
assert.match(html,
  /const consoleHasActiveTransfers = \(transferDisplayJobs\.get\(requestScope\)[\s\S]*?optimisticUploadingSystems\.has\(consoleTransferKey\(requestDevice, key\)\)/,
  'The active-list merge must recognize both confirmed and newly requested console transfers');
assert.match(html,
  /if \(\(consoleHasActiveTransfers \|\| preserveNames\.has\(item\[0\]\)\) && !visibleNames\.has\(item\[0\]\)\)/,
  'Previously downloaded games must remain visible while the console is transferring');
console.log('Active-list transfer preservation checks passed.');
