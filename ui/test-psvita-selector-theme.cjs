const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(server, /<customView name="Icons" inherits="grid"><imagegrid name="gamegrid"><autoLayoutSelectedZoom>1\.0/);
assert.match(server, /<gameImage>\/userdata\/roms\/psvita\/media\/rp1-psvita-blank\.png<\/gameImage>/);
assert.match(server, /<image name="gridtile\.image"><maxSize>1 0\.84<\/maxSize>/);
assert.match(server, /<ninepatch name="gridtile\.background:selected"><path>\/userdata\/roms\/psvita\/media\/rp1-psvita-selector\.png<\/path>/);
assert.doesNotMatch(server, /<customView name="Icons" inherits="grid"><imagegrid name="gamegrid"><itemTemplate>/);

console.log('PS Vita uses a working selected grid-tile selector theme.');
