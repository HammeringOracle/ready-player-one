const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(html, /row\.classList\.contains\('console-transfer-active'\)[\s\S]*?requestActiveTransferScroll/u,
  'Clicking an actively transferring console must request a download-row scroll');
assert.match(html, /activeList\.querySelector\('\.device-game\.transfer-pending'\)/u,
  'The scroll target must be an active transfer row');
assert.match(html, /activeList\.scrollTo\(\{ top: targetTop, behavior: 'smooth' \}\)/u,
  'The active download must be brought into view');
assert.match(html, /renderPendingTransfers\(\);\s*requestAnimationFrame\(scrollToRequestedActiveTransfer\)/u,
  'An asynchronous inventory redraw must restore and scroll to the transfer row');

console.log('Console-click active-download scrolling checks passed.');
