const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(html, /const hasSavedVisibility = localStorage\.getItem\(visibilityStorageKey\(systemPickerDevice\)\) !== null;/);
assert.match(html, /visible\.has\(system\) \|\| \(!hasSavedVisibility && detected\.has\(system\)\)/);
assert.doesNotMatch(html, /visible\.has\(system\) \|\| detected\.has\(system\)/);
assert.match(html, /const removed = new Set\(\[\.\.\.explicitlyUncheckedSystems\]\.filter\(system => !selected\.has\(system\)\)\);/);
assert.doesNotMatch(html, /const removalCandidates = new Set\(\[\.\.\.previous, \.\.\.detected/);
assert.doesNotMatch(server, /systems\.includes\("kodi"\) && !reconciledVisibleSystems\.includes\("kodi"\)/);

console.log('System picker keeps saved exclusions authoritative after first inventory.');
