const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
assert.match(html, /id="visibleSystemCount">\(0\)<\/span>/u);
assert.match(html, /const virtualCollectionSystems = new Set\(\["all", "favorites"\]\)/u);
assert.match(html, /const consoleCountExclusions = new Set\(\["karaoke", "pikaraoke", "music", \.\.\.virtualCollectionSystems\]\)/u);
assert.match(html, /\[\.\.\.rows\]\.filter\(row => !consoleCountExclusions\.has\(row\.dataset\.system\)\)\.length/u);
assert.doesNotMatch(html, /!row\.hidden && !consoleCountExclusions/u);
const consoleList = html.match(/<div class="systems-list">([\s\S]*?)<\/div>\s*<\/aside>/u)?.[1] || '';
const systems = [...consoleList.matchAll(/data-system="([^"]+)"/gu)].map(match => match[1]);
const uniqueSystems = new Set(systems);
const expectedCount = [...uniqueSystems].filter(system => !['karaoke', 'pikaraoke', 'music', 'all', 'favorites'].includes(system)).length;
assert.equal(expectedCount, 45, 'RP1 must report all 45 supported consoles');
assert.match(html, /visibleSystemCount\.textContent = `\(\$\{consoleCount\}\)`/u);
console.log('Console header reports all 45 supported consoles, excluding services and virtual collections.');
