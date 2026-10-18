const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(server, /job\.system !== "snes"[\s\S]*\.(?:\\\(\?:smc|smc)/u, 'backend must repair SNES jobs assigned to any wrong console');
assert.match(server, /if \(!fs\.existsSync\(path\.join\(root, "roms", "snes", job\.fileName\)\)\) return null/u, 'backend must discard dead misplaced SNES activity after its local ROM was removed');
assert.match(html, /for \(const \[system, names\] of Object\.entries\(saved\)\)/u, 'browser queue repair must inspect every console');
assert.match(html, /saved\.snes = \[\.\.\.restoredSnes\]/u, 'misplaced SNES selections must return to SNES');
assert.match(html, /transferDisplayJobs\.set\(pendingResetScope\(requestDevice, requestSystem\), selectedJobs\.filter\(job =>\s*job\.system === requestSystem && job\.running && !job\.completed/u, 'right pane must store only live transfers for the selected machine and console');

console.log('Cross-console transfer repair and startup display checks passed.');
