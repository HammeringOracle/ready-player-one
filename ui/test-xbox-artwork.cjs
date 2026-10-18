const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const cleanRomName = require('./rom-name');

assert.strictEqual(
  cleanRomName('Half-Life 2 (USA, Europe) (En,Fr,De,Es,It).xiso.iso'),
  'Half-Life 2'
);

for (const system of ['xbox', 'xbox360']) {
  const theme = require('./local-media-theme')('/theme/base.xml', system);
  assert(theme.includes(`READY PLAYER ONE ${system === 'xbox' ? 'XBOX' : 'XBOX 360'} PICTURES`));
  assert(theme.includes('<autoLayout>5 2</autoLayout>'));
  assert(theme.includes('<maxSize>1.10 1.10</maxSize>'));
  assert(theme.includes('<cornerSize>0 0</cornerSize><padding>-38 -38</padding>'));
  assert(theme.includes(`/userdata/roms/${system}/media/rp1-${system}-blank.png`));
  assert(theme.includes(`/userdata/roms/${system}/media/rp1-${system}-selector.png`));
  assert(theme.includes('<animateColor>F2C94CFF</animateColor>'));
}

function countPngs(directory) {
  let total = 0;
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (/\.png$/i.test(entry.name)) total += 1;
    }
  }
  return total;
}

assert.strictEqual(countPngs(path.join(root, 'covers', 'xbox')), 961);
assert.strictEqual(countPngs(path.join(root, 'covers', 'xbox360')), 806);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
assert(server.includes('"xbox", "xbox360", "mame"'));
assert(server.includes('if (usesLocalOnlyArtwork(system))'));
assert(server.includes('matched original from the local covers folder, or RP1\'s generated default'));
assert(server.includes('system === "xbox" ? "Xbox" : system === "xbox360" ? "Xbox 360"'));
assert(server.includes('["gamecube", "wii", "ps1", "ps2", "ps3", "xbox", "xbox360"].includes(system) ? wiiShape'));
assert(server.includes('const discSystem = ["gamecube", "wii", "ps1", "ps2", "ps3", "xbox", "xbox360"].includes(system)'));
assert(server.includes('$disc.AddEllipse(1,1,$side-2,$side-2)'));

console.log('Xbox and Xbox 360 local artwork pipeline tests passed.');
