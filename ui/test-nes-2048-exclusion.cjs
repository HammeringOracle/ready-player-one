const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert(!html.includes('["2048(tone).nes"'), 'The fallback NES library must not advertise 2048');
assert(server.includes('function isExcludedLibraryGame(system, fileName)'), 'The backend must define a shared game exclusion rule');
assert(server.includes('names = names.filter(name => !isExcludedLibraryGame(system, name));'), 'Local discovery must exclude 2048');
assert(server.includes('.filter(fileName => !isExcludedLibraryGame(system, fileName));'), 'Persistent transfer queues must exclude 2048');
assert(server.includes('if (isExcludedLibraryGame(system, fileName)) throw new Error'), 'Direct uploads must reject 2048');
assert(server.includes('if (system === "nes") await removeExcludedNes2048FromBatocera(device);'), 'Adding NES must remove a preloaded 2048 game');
assert(server.includes("document.remove(game)"), 'Cleanup must remove the stale gamelist entry');

console.log('PASS: 2048 is excluded locally and removed when NES is added.');
