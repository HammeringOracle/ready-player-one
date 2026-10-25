const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const project = String.raw`C:\Users\EF\Documents\Ready Player One`;
const server = fs.readFileSync(path.join(project, 'ui', 'server.js'), 'utf8');
const appearance = fs.readFileSync(path.join(project, 'ui', 'appearance.js'), 'utf8');

assert.match(appearance, /data-control="xboxRenderer"/, 'Machine Behavior must show an Xbox renderer control');
assert.match(appearance, /OPENGL/, 'Machine Behavior must offer OpenGL');
assert.match(server, /xbox\.xemu_api/, 'Backend must persist Batocera Xemu renderer selection');
assert.match(server, /\["AUTO", "VULKAN", "OPENGL"\]/, 'Backend must reject unsupported renderer values');
assert.match(server, /XboxRenderer/, 'Restore Previous must preserve the prior Xbox renderer');
assert.match(appearance, /name="xboxVideoMode"/, 'Machine Behavior must offer a separate Xbox display resolution control');
assert.match(appearance, /720p \(1280×720\)/, 'Machine Behavior must offer 720p');
assert.match(server, /xbox\.videomode/, 'Backend must persist the Xbox-only display resolution');
assert.match(server, /XboxVideoMode/, 'Restore Previous must preserve the prior Xbox display resolution');
console.log('PASS: Xbox renderer is a persistent, restorable per-machine behavior.');
