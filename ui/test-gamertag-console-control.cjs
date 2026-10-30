const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
assert.match(html, /data-system="xbox360"[\s\S]*?<button class="gamertag-console-button"[\s\S]*?<span class="count">0<\/span>/, 'GamerTag icon must sit immediately left of the ROM count.');
assert.match(html, /\.gamertag-console-button \{[\s\S]*?width: 16px;[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?margin-right: -6px;/, 'GamerTag control must render as an unbuffered icon close to the ROM count.');

console.log('Xbox 360 GamerTag console control layout checks passed.');
