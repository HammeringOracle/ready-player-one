const fs = require('node:fs');
const assert = require('node:assert');

const source = fs.readFileSync(require.resolve('./server.js'), 'utf8');

assert.match(source, /const hiddenMameSupportFiles = new Set/);
assert.match(source, /function hideMameSupportFiles\(system, names\)/);
assert.match(source, /hiddenMameSupportFiles\.has\(path\.basename\(String\(name\)\)\.toLowerCase\(\)\)/);
assert.ok((source.match(/hideMameSupportFiles\(system, (?:names|files|remoteNames)\)/g) || []).length >= 5);
assert.match(source, /gtfore06: \["iteagle\.zip"\]/);

console.log('MAME support BIOS archives remain transferable but hidden from game lists.');
