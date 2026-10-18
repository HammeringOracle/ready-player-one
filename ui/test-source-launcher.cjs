const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const launcher = fs.readFileSync(path.join(__dirname, '..', 'Start Ready Player One.bat'), 'utf8');
const backendStart = launcher.indexOf('ui\\start-server.js');
const shellStart = launcher.indexOf('Ready Player One.exe');

assert(backendStart >= 0, 'The launcher must start the current source backend');
assert(shellStart > backendStart, 'The current source backend must start before the existing desktop shell');
assert.match(launcher, /timeout \/t 2/, 'The launcher must give the current backend time to claim port 8789');
assert.doesNotMatch(launcher, /call npm run dev/, 'Launching current RP1 must not build a new executable');

console.log('Current-source, no-build launcher checks passed.');
