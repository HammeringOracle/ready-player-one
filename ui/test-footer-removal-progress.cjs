const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert(html.includes('function beginFooterRemoval(total, device = selectedDevice, system = selectedSystem)'), 'Game removals must initialize scoped footer progress');
assert(html.includes('beginFooterRemoval(games.length, queueDevice, queueSystem);'), 'Bulk removal must use the complete removal count and original scope');
assert(html.includes('completeFooterRemoval(targetDevice, targetSystem);'), 'Each successful removal must advance the scoped footer count');
assert(html.includes('footerTransferCount.textContent = `${remaining}/${safeTotal}`;'), 'Removal progress must count backward from total to zero');
assert(html.includes('footerTransferFill.style.width = `${safeTotal ? (remaining / safeTotal) * 100 : 0}%`;'), 'Removal bar must drain from full to empty');
assert(html.includes('await stopConsoleTransfersForRemoval(queueDevice, queueSystem);'), 'Remove All must stop active transfers before deleting');
assert(html.includes('syncStatus.classList.add("transfers-active");'), 'Removal filenames must remain hidden in the footer');
assert(html.includes('if (ownsFooterRemoval) finishFooterRemoval(false);'), 'A failed individual removal must clear its footer operation state');

console.log('Footer removal progress checks passed.');
