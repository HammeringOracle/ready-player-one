const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert(html.includes("psvita: 'Copy and install the verified PS Vita system and font firmware in Vita3K'"));
assert(html.includes("['ps1','ps2','ps3','ps4','psvita'].includes(system)"));
assert(!/const manual = new Set\([^\n]*'psvita'/.test(html));
assert(server.includes('"PSVUPDAT.PUP"'));
assert(server.includes('"PSP2UPDAT.PUP"'));
assert(server.includes('installCachedPsVitaFirmware(device)'));
assert(server.includes('/usr/bin/vita3k/Vita3K --firmware'));
assert(server.includes('/userdata/saves/psvita/vs0/sys/external'));
assert(server.includes('/userdata/saves/psvita/sa0/data/font/pvf/ltn0.pvf'));
assert(server.includes('systems.psvita = (await getPsVitaFirmwareStatus(device)).installed'));

console.log('PS Vita firmware setup checks passed.');
