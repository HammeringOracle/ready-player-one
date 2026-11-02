const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(html, /const explicitlyUncheckedSystems = new Set\(\);/u, 'Each picker edit must track its own unchecked consoles.');
assert.match(
  html,
  /const removed = new Set\(\[\.\.\.previous, \.\.\.explicitlyUncheckedSystems\]\.filter\(system => !selected\.has\(system\)\)\);/u,
  'Only a previously selected console or one unchecked during this edit may be removed.'
);

console.log('System removal is restricted to the current edit.');
