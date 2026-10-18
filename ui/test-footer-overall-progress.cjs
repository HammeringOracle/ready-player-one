const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert(html.includes('class="footer-transfer-progress"'), 'Footer needs an overall transfer progress display');
assert(html.includes('id="footerTransferCount">0/0'), 'Footer progress must use moved/total notation');
assert(html.includes('const totalFiles = selectedKeys.size;'), 'Each console must retain its own selected total even between active copies');
assert(html.includes('const footerLibrary = (window.warehouseLibrary || fallbackLibrary)[footerSystem];'), 'Footer totals must come from the complete local console library');
assert(html.includes('activeLayoutNames(footerSystem, footerLibrary?.warehouse || [])'), 'Footer totals must not be limited to the saved transfer selection');
assert(html.includes('const movedFiles = Math.min(totalFiles, completedSelectedKeys.size);'), 'Completed count must never exceed the selected-console total');
assert(html.includes('const footerProgressByScope = new Map();'), 'Footer progress must be isolated by machine and console');
assert(html.includes('if (loadedTotal > 0 && snapshot.total !== loadedTotal)'), 'A temporary startup 0/0 must be replaced when the real local console library loads');
assert(html.includes('const footerScope = footerProgressScope(requestDevice, footerSystem);'), 'A status response must update only its originating machine-console footer');
assert(html.includes('if (requestDevice !== selectedDevice || requestSystem !== selectedSystem) return;'), 'A late status response must not overwrite another console footer');
assert(html.includes('const consoleTransfersActive = consoleJobs.some(job => job.running) || consoleQueuedItems.length > 0;'), 'Yellow footer state must require running or queued work for the selected console');
assert(!html.includes('const romTransferredJobKeys = new Set(selectedJobs'), 'Historical completed jobs must not count as currently installed games');
assert(html.includes('if (footerInstalled.has(fileName)) completedSelectedKeys.add(fileName);'), 'The live machine inventory must be authoritative for the installed numerator');
assert(!html.includes('class="transfer-orb"'), 'The old transfer activity button must not remain in the footer');
assert(html.includes('.footer .sync-status { display: none; }'), 'The footer status line must never expose transfer filenames');
assert(html.includes('footerTransferProgress.hidden = false;'), 'Idle consoles must retain a visible 0/0 display');
assert(html.includes('.footer-transfer-progress[hidden] { display: none; }'), 'Hidden idle progress must not occupy footer space');
assert(html.includes('for (const [system, names] of Object.entries(saved))'), 'Corrupted SNES selections must be repaired across every wrong console queue');
assert(html.includes("activeList.scrollTo({ top: targetTop, behavior: 'smooth' });"), 'The right pane must move to the active transfer row');

console.log('Footer overall transfer progress checks passed.');
