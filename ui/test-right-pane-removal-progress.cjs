const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(server, /const removalJobs = new Map\(\)/, 'The backend must track active deletions separately from uploads');
assert.match(server, /\/api\/roms\/removal-status/, 'The UI needs a live deletion-status endpoint');
assert.match(server, /percent: 100, stage: "Deleting ROM"/, 'Deletion progress must begin full');
assert.match(server, /percent: 45, stage: "Deleting picture"/, 'Deletion progress must include picture removal');
assert.match(server, /percent: 0, stage: "Removed"/, 'Deletion progress must finish empty');
assert.match(html, /classList\.add\('removal-pending'\)/, 'A deleting game must remain visibly marked in the right pane');
assert.match(html, /api\/roms\/removal-status/, 'The right pane must poll actual backend deletion phases');
assert.match(html, /paintRemoval\(0, "Removed"\)/, 'A completed deletion must drain its row progress before removal');
assert.doesNotMatch(html, /activeList\.querySelectorAll\('\.device-game'\)\.forEach\(row => \{ row\.hidden = true; \}\)/, 'Remove All must not hide every row before deletion starts');
assert.match(html, /const names = \[\.\.\.new Set\(activeLayoutNames\(system, result\.items \|\| \[\]\)\)\]\.reverse\(\)/, 'Remove All must queue the visible list from bottom to top');
assert.match(html, /const smallRemovals = removalItems\.filter\(item => item\.size <= WAREHOUSE_LARGE_FILE_BYTES\)/, 'Small removals must be classified with the same 50 MB rule as uploads');
assert.match(html, /await removeGroup\(smallRemovals, 10\)[\s\S]*?await removeGroup\(largeRemovals, 4\)/, 'Deletion must allow ten small games or four large games simultaneously without combining both groups');

console.log('Right-pane reverse deletion progress checks passed.');
