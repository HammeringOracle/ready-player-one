const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'companions', 'ready-player-two', 'src-tauri', 'src', 'main.rs'), 'utf8');

assert(!html.includes('id="openDualBootUndo"'), 'Dual Boot Undo must not remain in RP1 Advanced Features');
assert(!html.includes('/ui/dual-boot-undo-ui.js'), 'RP1 must not load the removed Undo modal');
assert.match(main, /include_bytes!\("\.\.\/\.\.\/\.\.\/\.\.\/ui\/dual-boot-undo\.exe"\)/, 'RP2 must embed the portable Undo executable');
assert.match(main, /GetFolderPath\('Desktop'\)/, 'RP2 must resolve the actual Windows Desktop folder');
assert.match(main, /Dual Boot Undo\.lnk/, 'RP2 must create the named Desktop shortcut');
assert.match(main, /needs_write[\s\S]*bytes != DUAL_BOOT_UNDO/, 'Every RP2 launch must refresh an outdated embedded Undo tool');

console.log('RP2 Dual Boot Undo desktop-shortcut regression test passed.');
