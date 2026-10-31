const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const filter = html.match(/\.device-filter \{([\s\S]*?)\n    \}/u)?.[1] || '';
const main = html.match(/\.main \{([\s\S]*?)\n    \}/u)?.[1] || '';
assert.match(filter, /height:\s*25px/u, 'filter must be 25px high');
assert.match(main, /grid-template-rows:\s*25px minmax\(0, 1fr\)/u, 'filter grid row must match its 25px height');
assert.match(main, /row-gap:\s*6px/u, 'filter-to-pane gap must be 6px');
assert.match(main, /padding:\s*6px 12px 6px/u, 'header-to-filter gap must be 6px');
console.log('PASS: filter height and vertical spacing are compact.');
