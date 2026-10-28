const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readWiiTitle = require('./wii-title');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rp1-wii-title-'));
const image = path.join(temporary, 'RMGE01.wbfs');
const wbfsSector = 2 ** 21;
const file = Buffer.alloc(wbfsSector + 0x60);
file.write('WBFS', 0, 'ascii');
file[8] = 9;
file[9] = 21;
file[12] = 1;
file.write('RMGE01', wbfsSector, 'ascii');
file.write('Super Mario Galaxy', wbfsSector + 0x20, 'latin1');
fs.writeFileSync(image, file);
assert.equal(readWiiTitle(image), 'Super Mario Galaxy');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
assert(server.includes('const embeddedTitle = readWiiTitle(localPath)'));
assert(server.includes('system === "wii" ? displayGameTitle(system, fileName) : fileName'));
assert(server.match(/\["mame", "wii"\]\.includes\(system\) \? displayGameTitle/g).length >= 3);
assert(server.includes('const name = `${stem}.wbf${part}`'));
fs.rmSync(temporary, { recursive: true, force: true });
console.log('Wii embedded display names passed.');
