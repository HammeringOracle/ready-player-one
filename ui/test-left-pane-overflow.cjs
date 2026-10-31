const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const listCss = html.match(/\.systems-list \{([\s\S]*?)\n    \}/u)?.[1] || '';
const rowCss = html.match(/\.systems-list \.row \{([\s\S]*?)\n    \}/u)?.[1] || '';

assert.match(listCss, /overflow-x:\s*hidden/u, 'the console pane must never scroll horizontally');
assert.match(listCss, /min-width:\s*0/u, 'the console pane must be allowed to shrink inside its grid column');
assert.match(rowCss, /max-width:\s*100%/u, 'console cards must remain inside the pane width');

console.log('PASS: the left console pane is constrained to vertical scrolling.');
