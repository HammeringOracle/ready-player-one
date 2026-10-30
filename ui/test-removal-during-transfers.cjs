const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const route = server.match(/if \(req\.method === "POST" && url\.pathname === "\/api\/roms\/remove"\) \{([\s\S]*?)\n    \}\n\n    if \(req\.method === "POST" && url\.pathname === "\/api\/systems\/remove"/u)?.[1] || '';

assert.ok(route, 'ROM removal route must exist');
assert.doesNotMatch(route, /Pause active transfers for this system/u,
  'One active transfer must not block another ROM removal in the same console');
assert.match(route, /const targetTransferKey = JSON\.stringify\(\[body\.device, body\.system, body\.fileName\]\)/u);
assert.match(route, /activeUploadCancels\.get\(targetTransferKey\)\?\.\(\)/u,
  'Removing an actively transferring ROM must cancel only that exact stream');
assert.match(route, /while \(targetTransfer\.running/u,
  'Deletion must wait for the selected writer to release its partial file');
assert.match(route, /`\$\{remotePath\}\.bw-part`/u,
  'Cancelled file transfers must delete their partial staging file');
assert.match(html, /await removeFromSelectedDevice\(fileName,\{device,system\}\)/u,
  'The right pane must use the atomic cancel-and-remove path');
assert.match(html, /row\.remove\(\)[\s\S]*await removeFromSelectedDevice/u,
  'The selected right-pane row must disappear before network cleanup waits');
console.log('Per-ROM cancellation/removal stays fluid while sibling console transfers continue.');
