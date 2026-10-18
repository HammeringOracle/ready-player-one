const fs = require('node:fs');
const assert = require('node:assert');

const source = fs.readFileSync(require.resolve('./server.js'), 'utf8');

assert.match(source, /const mameSharedDependencies = \{\s*gtfore06: \["iteagle\.zip"\]/);
assert.match(source, /function uploadTransferFiles\(system, fileName\)/);
assert.match(source, /const diskFolder = path\.join\(rootDir, shortName\)/);
assert.match(source, /listLocalFilesRecursive\(diskFolder/);
assert.match(source, /const transferFiles = uploadTransferFiles\(system, fileName\)/);
assert.match(source, /const ps1Files = !isDirectory \? uploadTransferFiles\(system, fileName\) : \[\]/);
assert.match(source, /const ps1Files = uploadTransferFiles\(system, fileName\)/);

console.log('MAME CHD folders and shared BIOS dependencies are included in uploads.');
