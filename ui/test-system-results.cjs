const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(html, /results\.map\(result => `• \$\{result\}`\)\.join\('\\n\\n'\)/u,
  'system setup and removal results should display as a spaced bullet list');
assert.doesNotMatch(html, /message: results\.join\('\\n'\)/u,
  'system setup results should not be rendered as an unstructured text block');

console.log('System setup result bullet-list checks passed.');
