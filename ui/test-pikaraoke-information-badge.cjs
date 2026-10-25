const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
assert.match(html, /data-system="pikaraoke"[\s\S]*?<span class="count">I<\/span>/,
  'PiKaraoke must show an information marker instead of a local ROM count');
assert.match(html, /badge\.textContent = key === "pikaraoke" \? "I" : count\.toLocaleString\(\);/,
  'Library refreshes must preserve the PiKaraoke information marker');
console.log('PiKaraoke information badge checks passed.');
