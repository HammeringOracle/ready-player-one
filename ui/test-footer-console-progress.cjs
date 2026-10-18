const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert(html.includes('const footerSystem = selectedSystem;'), 'Footer progress must be scoped to the console being viewed');
assert(html.includes('visibleJobs.filter(job => job.system === footerSystem)'), 'Only current-console jobs may drive footer progress');
assert(html.includes('queuedItems.filter(item => item.system === footerSystem)'), 'Only current-console queued items may drive footer progress');
assert(html.includes('const totalFiles = consoleTransfersActive ? selectedKeys.size : 0;'), 'An idle console must display 0/0');
assert(html.includes('footerTransferProgress.classList.toggle("console-active"'), 'Active current-console progress must receive its yellow state');
assert(html.includes('.footer-transfer-progress.console-active .footer-transfer-fill'), 'Active progress must use the dark-yellow fill');
assert(html.includes('footerRemovalProgress?.device === selectedDevice && footerRemovalProgress?.system === selectedSystem'), 'Removal progress must also remain scoped to its console');
assert(html.includes('renderConsole(selectedSystem);\n        refreshTransferActivity();'), 'Switching consoles must refresh footer progress immediately');

console.log('Console-scoped footer progress checks passed.');
