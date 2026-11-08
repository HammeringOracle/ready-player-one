const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const start = html.indexOf('function movieIdentity');
const end = html.indexOf('\n    function matchingWarehouseFileName', start);
assert(start >= 0 && end > start, 'Movie identity matching must be present.');
const movieIdentity = Function(`${html.slice(start, end)}; return movieIdentity;`)();

const renamed = 'Young Washington (2026).mp4';
const original = 'Young.Washington.2026.1080p.BluRay.x264.AAC5.1-[YTS.GG - YTS.BZ].mp4';
assert.equal(movieIdentity(renamed), movieIdentity(original), 'A renamed local movie must match its original remote filename.');
assert.notEqual(movieIdentity('Jet.2026.1080p.WEBRip.x264.AAC.mp4'), movieIdentity(original));
assert.match(html, /const warehouseFileName = matchingWarehouseFileName\(system, fileName\);/);
assert.match(html, /setLayoutSelection\(system, warehouseFileName, false\);/);
assert.match(html, /warehouseGameControls\.get\(warehouseFileName\)/);

console.log('Movie rename reconciliation tests passed.');
