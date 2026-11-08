const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(server, /const gbaShape = "\$path\.StartFigure\(\);\$path\.AddArc\(22,14,31,31,180,90\)/);
assert.match(server, /\$path\.AddArc\(459,14,31,31,270,90\)/);
assert.match(server, /\$path\.AddLine\(482,78,482,274\);\$path\.AddArc\(458,262,24,24,0,90\)/);
assert.match(server, /\$path\.AddArc\(30,262,24,24,90,90\);\$path\.AddLine\(30,274,30,78\)/);
assert.doesNotMatch(server, /const gbaShape = .*AddArc\(22,14,36,36/);

console.log('GBA selector uses 85% corner radii with exposed lower legs.');
