const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
assert.match(html, /const legacyAutoMergedSystems = new Set/u);
assert.match(html, /saved\.length >= 30 && mergedSignatureCount >= 18/u, 'repair must require the distinctive large corrupted cache');
assert.match(html, /saved = saved\.filter\(system => !legacyAutoMergedSystems\.has\(system\)\)/u, 'repair must remove only the accidentally appended block');
assert.match(html, /localStorage\.setItem\(visibilityStorageKey\(device\), JSON\.stringify\(saved\)\)/u, 'repaired cache must persist');
console.log('PASS: the legacy all-console cache is repaired without affecting ordinary selections.');
