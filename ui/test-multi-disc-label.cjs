const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(html, /class="multi-disc-count">\(\$\{discSet\.files\.length\} discs\)<\/span>/,
  'Multi-disc count must appear beside the title in both panes.');
assert.match(html, /const badge = tracks\.length[\s\S]*?: gameExtensionBadge\(item\[0\], item\[2\]\);/,
  'The right-pane badge must retain the actual game file format.');
assert.doesNotMatch(html, /: discSet \? `\$\{discSet\.files\.length\} DISCS`/,
  'Disc count must never replace the far-right file-format badge.');
assert.doesNotMatch(server, /type: discSet \? `\$\{discSet\.count\} DISCS` : extension/,
  'The backend must not replace a multi-disc launcher format with its disc count.');
assert.match(server, /rows\.push\(\{ name, type: extension, discSet \}\)/,
  'The backend must return the real launcher extension for multi-disc entries.');
assert.match(html, /isBad \? "BAD ZIP" : gameExtensionBadge\(item\[0\], item\[2\]\)/,
  'The middle pane must derive its far-right badge from the filename.');
assert.match(html, /\.multi-disc-count\s*\{[\s\S]*?color: #e8a83a;/,
  'The disc count must use the yellow-orange treatment.');

console.log('PASS: multi-disc counts stay beside titles and file formats remain visible.');
