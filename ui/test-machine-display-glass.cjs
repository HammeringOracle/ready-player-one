const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('Ready Player One.html', 'utf8');
assert.match(html, /remoteDisplayButton\.className = 'advanced-item display-action'/, 'right-click Display must use its glass action class');
assert.match(html, /\.machine-context-menu \.advanced-item:is\(\.display-action,\.osd-action\) \{[^}]*linear-gradient[^}]*box-shadow:/, 'Display and OSD must retain visible glass depth and highlight');
assert.match(html, /remoteDisplayButton\.addEventListener\('click',[^\n]*openMachineDisplayChoice\(card\)/, 'right-click Display must open the connection selector');
assert.doesNotMatch(html, /const adHocDisplayButton = document\.createElement/, 'Ad Hoc must not remain a separate right-click action');
assert.match(html, /async function openMachineDisplayChoice\(card\)[\s\S]*confirmLabel:'Network', alternateLabel:'Ad Hoc'[\s\S]*glassyActions:true, profileChoiceActions:true/, 'Display selector must provide glassy Network and Ad Hoc choices');
console.log('PASS: machine right-click Display uses an explicit glassy 3D finish.');
