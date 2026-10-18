const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const theme = require('./local-media-theme')('/theme/base.xml', 'gamecube');
assert(theme.includes('READY PLAYER ONE GAMECUBE PICTURES'));
assert(theme.includes('<autoLayout>5 2</autoLayout>'));
assert(theme.includes('<maxSize>1.10 1.10</maxSize>'));
assert(theme.includes('<cornerSize>0 0</cornerSize><padding>-38 -38</padding>'));
assert(theme.includes('/userdata/roms/gamecube/media/rp1-gamecube-blank.png'));
assert(theme.includes('/userdata/roms/gamecube/media/rp1-gamecube-selector.png'));
assert(theme.includes('<animateColor>F2C94CFF</animateColor>'));

const pending = [path.join(root, 'covers', 'gamecube')];
let pngs = 0;
while (pending.length) {
  const directory = pending.pop();
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) pending.push(full);
    else if (/\.png$/i.test(entry.name)) pngs += 1;
  }
}
assert(pngs >= 677, `Expected the complete 677-image GameCube pack; found ${pngs}.`);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
assert(server.includes('"nes", "snes", "gba", "n64", "gamecube", "wii"'));
assert(server.includes('system === "gamecube" ? "GameCube"'));
assert(server.includes('system === "gamecube" ? /^007 - Agent Under Fire'));
assert(server.includes('const localGameCubeArtwork = system === "gamecube"'));
assert(!server.includes('cleaned.split(/\\s+-\\s+/)[0]'));
assert(server.includes('gamecube: [".iso", ".gcm", ".gcz", ".rvz", ".wia", ".wbfs", ".ciso", ".dol", ".elf", ".m3u", ".json"]'));

console.log(`GameCube local artwork pipeline tests passed (${pngs} PNG files available).`);
