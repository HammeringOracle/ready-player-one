const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const selected = html.match(/\.device-card\.selected \{([\s\S]*?)\n    \}/u)?.[1] || '';
assert.match(selected, /0 0 8px 2px/u, 'machine halo needs a tight luminous core');
assert.match(selected, /0 0 20px 6px/u, 'machine halo needs a middle falloff');
assert.match(selected, /0 0 34px 12px/u, 'machine halo needs a broad transparent fade');
for (const state of ['offline', 'reachable', 'searching']) {
  const css = html.match(new RegExp(`\\.device-card\\.${state}\\.selected \\{([\\s\\S]*?)\\n    \\}`, 'u'))?.[1] || '';
  assert.match(css, /0 0 8px 2px/u, `${state} halo needs the same layered falloff`);
}
console.log('PASS: machine cards use a soft layered status halo.');
