const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(source, /async function removePublishedArtwork\(device, system, fileName\)/, 'ROM removal must also remove its published artwork');
assert.match(source, /for \(const tag of \["image", "thumbnail", "marquee"\]\)/, 'Local cleanup must cover every Batocera artwork field');
assert.match(source, /for tag in \('image','thumbnail','marquee'\)/, 'Remote cleanup must cover every Batocera artwork field');
assert.match(source, /media-remaining/, 'Shared artwork must remain while another game still references it');
assert.match(source, /const artwork = removal\?\.queued[\s\S]*?await removePublishedArtwork/, 'The delete endpoint must run artwork cleanup after ROM deletion');
assert.match(source, /const storage = removal\?\.queued \? null : await getDeviceStorage\(device\)/, 'The delete response must contain authoritative post-delete free space');
assert.match(source, /sendJson\(res, 200, \{ ok: true, queued: Boolean\(removal\?\.queued\), artwork, storage,/, 'The delete endpoint must return artwork and storage results together');

console.log('ROM, artwork, metadata, and free-space removal checks passed.');
