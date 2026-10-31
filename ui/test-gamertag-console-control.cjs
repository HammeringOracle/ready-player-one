const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
assert.match(html, /data-system="xbox360"[\s\S]*?<button class="gamertag-console-button"[\s\S]*?<span class="count">0<\/span>/, 'GamerTag icon must sit immediately left of the ROM count.');
assert.match(html, /\.gamertag-console-button \{[\s\S]*?width: 16px;[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?margin-right: -2px;/, 'GamerTag control must render as an unbuffered icon close to the ROM count.');
assert.match(html, /const profileChoice = await showXboxBiosDialog\(\{[\s\S]*message: '• Xenia Profile: Quit any running Xbox 360 game and return to Batocera’s game list[\s\S]*• GamerTag \(Xbox\):[\s\S]*confirmLabel: 'GamerTag \(Xbox\)'[\s\S]*alternateLabel: 'Xenia Profile'[\s\S]*cancellable: true, showCancel: false[\s\S]*glassyActions: true, profileChoiceActions: true/, 'GamerTag icon must open the clarified bulleted two-choice glass profile modal without a Cancel button.');
assert.match(html, /if \(profileChoice === 'xenia-profile'\)[\s\S]*fetch\('\/api\/xenia-profile\/open'/, 'Xenia Profile choice must open Xenia native profile setup.');
assert.match(html, /#xboxBiosDialog\.glassy-actions :is\(#cancelXboxBiosDialog, #alternateXboxBiosDialog, #confirmXboxBiosDialog\)/, 'all three profile choice buttons must use shared glassy styling.');
assert.match(html, /title: 'Xbox 360 GamerTags'[\s\S]*glassyActions: true, gamerTagEditor: true/, 'GamerTag editor actions must use the shared glass finish.');
assert.match(html, /#xboxBiosDialog\.gamertag-editor \.confirm-modal \{ width:min\(390px,92vw\)!important; \}/, 'GamerTag editor must use a compact modal.');
assert.match(html, /#xboxBiosDialog\.gamertag-editor \.gamertag-list \{ width:min\(240px,100%\)/, 'GamerTag inputs must use the requested half-width list.');
assert.match(html, /#xboxBiosDialog\.gamertag-editor \.gamertag-name-input \{ height:25px!important;/, 'GamerTag name inputs must be 25 pixels high.');
assert.match(html, /\.gamertag-add-button \{[^}]*display:inline-grid;place-items:center/, 'GamerTag plus glyph must be centered vertically and horizontally.');
assert.match(html, /\.gamertag-add-button::after \{[^}]*content:'\+'[^}]*inset:0[^}]*place-items:center[^}]*transform:translateY\(-1px\)/, 'GamerTag plus must use an independently optically-centered glyph layer.');
assert.match(html, /plus\.className = 'gamertag-add-button'/, 'GamerTag plus controls must receive the glass button class.');

console.log('Xbox 360 GamerTag console control layout checks passed.');
