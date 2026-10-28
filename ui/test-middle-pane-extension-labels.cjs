const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'Ready Player One.html'), 'utf8');
assert.match(html, /const displayName = gameTitleWithoutExtension\(item\[6\] \|\| item\[0\], item\[0\], isFolder\)/u,
  'Every middle-pane console row must use the common extension-free display helper');
assert.match(html, /gameExtensionBadge\(item\[0\], item\[2\]\)/u,
  'The right-side badge must continue displaying the file type');

const source = html.match(/function gameTitleWithoutExtension\(value, rawName = value, isFolder = false\) \{([\s\S]*?)\n    \}/u)?.[1];
assert.ok(source, 'Display helper must exist');
const gameTitleWithoutExtension = Function('value','rawName','isFolder', source);
assert.equal(gameTitleWithoutExtension('Silent Hill 2.iso','Silent Hill 2.iso',false),'Silent Hill 2');
assert.equal(gameTitleWithoutExtension('Game.iso (Disc 2)','Game.iso',false),'Game (Disc 2)');
assert.equal(gameTitleWithoutExtension('Dr. Mario','Dr. Mario.nes',false),'Dr. Mario');
assert.equal(gameTitleWithoutExtension('Folder.iso','Folder.iso',true),'Folder.iso');
console.log('All middle-pane consoles hide extensions while preserving file-type badges.');
