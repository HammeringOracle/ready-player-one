const assert = require('node:assert/strict');
const theme = require('./local-media-theme')('/tmp/base.xml', 'wiiu');

assert.equal((theme.match(/<size>1 0\.115<\/size>/g) || []).length, 2, 'Wii U normal and selected titles need the same two-line-height box');
assert.equal((theme.match(/<singleLineScroll>false<\/singleLineScroll>/g) || []).length, 2);
assert.match(theme, /<text name="gridtile">/u);
assert.match(theme, /<text name="gridtile:selected">/u);
console.log('Wii U game titles are constrained to a two-line-height grid caption.');
