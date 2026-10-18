const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(source, /"3dsen": "3dsen"/u, '3dSen remote system is registered');
assert.match(source, /"3dsen": "nes"/u, '3dSen mirrors the local NES library');
assert.match(source, /"3dsen": \["\.nes", "\.zip", "\.7z"\]/u, '3dSen accepts NES library formats');
assert.match(source, /os\.symlink\('\/userdata\/roms\/nes',roms\)/u, 'Batocera uses an NES mirror symlink');
assert.match(source, /'fullname':'3D NEC'.*'theme':'3dsen'/u, '3D NEC has its own visible identity instead of masquerading as NES');
assert.match(source, /-screen-fullscreen 1 -screen-width 1920 -screen-height 1080/u, '3D NEC uses a readable Unity-safe display mode');
assert.match(source, /pkill -f '\^3dSen\.exe\( \|\$\)'/u, '3D NEC clears a stale hidden instance before relaunching');
assert.match(source, /config_dir\/rom\.json/u, '3D NEC writes the emulator ROM-to-profile database');
assert.match(source, /-id=' \+ str\(profile_id\)/u, '3D NEC launches the selected profile directly');
assert.match(source, /"solomons key": 75/u, '3D NEC includes the official Solomon\'s Key profile');
assert.match(source, /replace\("'", ''\)\.replace\('’', ''\)/u, '3D NEC normalizes straight and curly apostrophes in ROM titles');
assert.match(source, /if \(system === "3dsen"\) return \[\.\.\.roots\];/u, 'removal cannot follow the mirror into NES');
assert.match(source, /batocera-wine windows play/u, 'launcher runs the private Windows build through Batocera Wine');
assert.match(source, /url\.pathname === "\/api\/3dsen\/setup"/u, 'console picker can install the 3dSen system');
assert.match(source, /await runSoftReset\(device\)/u, '3dSen setup performs RP1 full interface refresh automatically');
assert.match(source, /Batocera did not publish the console after its interface refresh/u, 'setup verifies the console is visible after refresh');
assert.match(source, /attempt < 20.*await wait\(1000\)/su, 'setup waits for Batocera API startup instead of racing the refresh');
assert.doesNotMatch(source, /flatpak install[^\n]*com\.valvesoftware\.Steam/u, '3dSen setup does not install Steam');
assert.match(source, /3dsen-runtime\/3dSen\.pc/u, '3dSen program files stay in RP1 private storage');
assert.match(source, /bundled 3dSen installer is missing/u, 'setup gives a clear error when the bundled purchased build is missing');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
assert.match(html, /data-system="3dsen"[^>]*>.*3D NEC/su, '3D NEC appears in the console list');
assert.match(html, /id="systemPickerTitle">Choose Console</u, 'the system picker uses the requested Choose Console title');
assert.match(html, /requirement-note">\(Beta\)</u, '3D NEC is visibly marked Beta');
assert.doesNotMatch(html, /requirement-note">Uses Wine</u, 'the internal Wine implementation is not used as the 3D NEC badge');
assert.match(html, /3D NEC remains its own console/u, 'checking 3D NEC explains its standalone console behavior');
assert.match(html, /automatically install its bundled 3dsenpc-win\.zip/u, 'checking 3dSen explains automatic bundled installation');
assert.match(html, /run it through Wine\. It will not appear in the Windows console/u, 'confirmation explains private Wine execution');

console.log('3dSen integration checks passed.');
