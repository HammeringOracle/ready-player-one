const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

for (const id of ['openSnapshots','snapshotsModal','snapshotsMode','snapshotConsoleOptions','snapshotsSystems','snapshotsAll','snapshotCenterSystem','captureSnapshots']) {
  assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must exist exactly once`);
}
assert.match(html, /id="openSnapshots"[^>]*>Console Snapshots<\/button>/u);
assert.match(html, /<option value="console">Console<\/option>/u);
assert.match(html, /<option value="batocera">Batocera<\/option>/u);
assert.match(html, /Console shown in the center/u);
assert.match(html, /const captureBatocera = snapshotsMode\.value === "batocera"/u);
assert.match(html, /const systems = captureBatocera \? \[\] : snapshotSystemBoxes/u, 'Batocera mode must send exactly one center-console selection, not the console checkbox list');
assert.match(html, /\/api\/snapshots\/capture/u);
assert.match(html, /batocera:captureBatocera,centerSystem:snapshotCenterSystem\.value/u);
assert.match(server, /url\.pathname === "\/api\/snapshots\/capture"/u);
assert.match(server, /Downloads", "RP1 Snapshots"/u);
assert.match(server, /setEsString\(originalSettings,"StartupSystem",batoceraSystem\)/u);
assert.match(server, /setEsBool\(settings,"StartupOnGameList",gameList\)/u);
assert.match(server, /const captureTargets = captureBatocera[\s\S]*?\? \[\{system:centerSystem,gameList:false\}\][\s\S]*?: requested\.map/u, 'Backend must enforce mutually exclusive Console and Batocera modes');
assert.match(server, /Batocera-\$\{safeLabel\}-Centered\.png/u);
assert.match(server, /writeSftpFile\(sftp,settingsPath,originalSettings\)/u, 'Original Batocera view settings must be restored');
console.log('Console Snapshots UI, game-list capture, Batocera centered-console capture, Downloads destination, and restoration checks passed.');
