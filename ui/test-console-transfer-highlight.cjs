const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(html, /const activelyUploadingSystems = new Set\(selectedJobs[\s\S]*?job\.running && !job\.completed && !job\.partialDeleted/, 'Console attention must use only live uploads on the selected machine');
assert.match(html, /row\.classList\.toggle\('console-transfer-active', activelyUploadingSystems\.has\(row\.dataset\.system\)\)/, 'Each console must independently reflect whether it is uploading');
assert.match(html, /\.systems-list \.row\.console-transfer-active > span:nth-child\(2\)[\s\S]*?color: #b89118/, 'The active-upload console name must be dark yellow');

console.log('Active console upload highlighting checks passed.');
