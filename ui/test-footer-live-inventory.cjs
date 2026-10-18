const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(
  html,
  /transferInstalledCache\.systems\[key\] = new Set\(activeLayoutNames\(key, visibleItems\)\);[\s\S]*?updateFooterFromCurrentInventory\(requestDevice, key\);/,
  'A confirmed live machine inventory must immediately hydrate that console footer'
);

console.log('footer live inventory test passed');
