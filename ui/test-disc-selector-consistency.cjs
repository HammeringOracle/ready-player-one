const assert = require('assert');
const fs = require('fs');
const path = require('path');

const discSystems = ['gamecube', 'wii', 'ps1', 'ps2', 'ps3', 'xbox', 'xbox360'];
const themeFactory = require('./local-media-theme');
for (const system of discSystems) {
  const theme = themeFactory('/theme/base.xml', system);
  assert(theme.includes('<autoLayout>5 2</autoLayout>'), `${system} must use the shared disc grid`);
  assert(theme.includes('<maxSize>1.10 1.10</maxSize>'), `${system} must use the shared image scale`);
  assert(theme.includes('<padding>-18 -18</padding><selectionMode>image</selectionMode>'), `${system} must use the shared tile footprint`);
  assert(theme.includes('<cornerSize>0 0</cornerSize><padding>-40 -40</padding>'), `${system} must use the shared selector footprint`);
}

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
assert(server.includes('const discNormalizationVersion = discSystem ? "|rp1-disc-canonical-v3" : ""'));
assert(server.includes('[Rp1AlphaBounds]::Find($source)'));
assert(server.includes('$sourceRect=$bounds'));
assert(server.includes('$canvasSide=1024'));
assert(server.includes('$margin=36;$diameter=952'));
assert(!server.includes('system === "gamecube" ? "0.035" : "0.055"'));

console.log('Disc selector consistency tests passed.');
