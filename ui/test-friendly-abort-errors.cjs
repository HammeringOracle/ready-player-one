const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.resolve(__dirname, 'server.js'), 'utf8');
assert.match(html, /controller\.abort\(timeoutError\)/u, 'Frontend timeouts must include a reason');
assert.match(html, /if \(controller\.signal\.aborted\) throw timeoutError/u,
  'Frontend must replace raw abort implementation messages');
assert.match(server, /controller\.abort\(timeoutError\)/u, 'Backend provider timeouts must include a reason');
assert.match(server, /if \(controller\.signal\.aborted\) throw timeoutError/u,
  'Backend must report the provider timeout rather than a raw abort');
console.log('Friendly abort timeout checks passed.');
