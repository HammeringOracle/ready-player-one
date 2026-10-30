const assert = require('assert');
const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert(server.includes('async function prepareXbox360XeniaRuntime(device)'));
assert(server.includes('.rp1-xenia-runtime-ready'));
assert(server.includes('.rp1-xenia-disclaimer-acknowledged'));
assert(server.includes('xenia-runtime.lock'));
assert(server.includes("WINEDLLOVERRIDES='mscoree,mshtml='"));
assert(server.includes('WINETRICKS_OPT_UNATTENDED=1'));
assert(server.includes('vcrun2022 >/tmp/rp1-xenia-winetricks.log'));
assert(server.includes("reg add 'HKCU\\\\Software\\\\Xenia' /v XEFLAGS /t REG_QWORD /d 3 /f"));
assert(server.includes('XENIA_DISCLAIMER_FLAG_FAILED'));
assert(server.includes('const result = await prepareXbox360XeniaRuntime(device);'));
assert(server.includes('The separate Wine console was not installed.'));
assert(html.includes("const setupResult = await request('/api/xbox360-xenia/setup', {device});"));
assert(html.includes("Prepare Batocera's internal Xenia runtime"));
assert(!html.includes('Verify Batocera Xenia without installing or initializing Wine'));

console.log('Xbox 360 internal runtime preparation wiring passed.');
