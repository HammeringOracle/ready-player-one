const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const theme = require('./local-media-theme')('/theme/base.xml', 'wiiu');
assert(theme.includes('READY PLAYER ONE WII U PICTURES'));
assert(theme.includes('<autoLayout>6 2</autoLayout>'));
assert(theme.includes('<maxSize>1.08 1.08</maxSize>'));
assert(theme.includes('<cornerSize>8 8</cornerSize><padding>-18 -18</padding>'));
assert(theme.includes('/userdata/roms/wiiu/media/rp1-wiiu-blank.png'));
assert(theme.includes('/userdata/roms/wiiu/media/rp1-wiiu-selector.png'));
assert(theme.includes('<animateColor>F2C94CFF</animateColor>'));

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
assert(server.includes('const localWiiUArtwork = system === "wiiu"'));
assert(server.includes('system === "wiiu" ? "Wii U"'));
assert(server.includes('system === "wiiu" ? /^007 Legends'));
assert(server.includes('["ps4", "wiiu"].includes(system) ? ps4Script'));

const coverRoot = path.join(root, 'covers', 'wiiu');
const pending = [coverRoot];
let pngs = 0;
while (pending.length) {
  const directory = pending.pop();
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) pending.push(full);
    else if (/\.png$/i.test(entry.name)) pngs += 1;
  }
}
assert.strictEqual(pngs, 675);
console.log('Wii U local artwork pipeline tests passed.');
