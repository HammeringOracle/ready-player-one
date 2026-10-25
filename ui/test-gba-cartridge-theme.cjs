const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const xml = require('./gba-cartridge-theme')('/userdata/themes/A&B/theme.xml');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(xml, /READY PLAYER ONE GBA PICTURES/);
assert.match(xml, /A&amp;B\/theme\.xml/);
assert.match(xml, /<cornerSize>16 16<\/cornerSize>/);
assert.match(xml, /<color>4FA9FFFF<\/color>/);
assert.match(xml, /<animateColor>F2C94CFF<\/animateColor>/);
assert.match(server, /system === "gba" \? "16 16"/);
assert.match(server, /const gbaShape = .*AddArc\(24,24,16,16/);
assert.match(server, /system === "gba" \? gbaShape/);

console.log('PASS: GBA selector uses half-radius corners in its theme and generated image.');
