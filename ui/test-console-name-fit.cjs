const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
assert.match(html, /\.systems-list \.row > span:nth-child\(2\)[\s\S]*?white-space: nowrap;[\s\S]*?font-size: 14px;/u);
assert.match(html, /row\[data-system="atari800"\][\s\S]*?row\[data-system="atarist"\][\s\S]*?font-size: 12px;/u);
assert.match(html, /\.systems-list \.row > \.count[\s\S]*?white-space: nowrap;/u);
console.log('Console names and counts remain on one fitted line.');
