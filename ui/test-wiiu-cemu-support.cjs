const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const expected = new Map([
  ['snd_user.rpl', '45b0dbe8926a263d86bc4e77084815e58336b9b437196d48bc3da3c5b2b2675e'],
  ['snduser2.rpl', 'ce928ad53d8497b6626ef3893cc0427c9ea36f0a63e82e2530179afa354eb15e']
]);

for (const [name, hash] of expected) {
  const file = path.join(root, 'installers', 'wiiu', 'cemu', 'cafeLibs', name);
  assert.ok(fs.existsSync(file), `${name} must be bundled with RP1`);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash, `${name} must match its verified source`);
}

assert.match(source, /async function installWiiUCemuSupport\(device\)/u, 'RP1 must have one reusable Wii U Cemu support installer');
assert.match(source, /000500001010cf00\.ini/u, 'Black Ops II must receive a title-specific profile');
assert.match(source, /loadSharedLibraries = true/u, 'the Black Ops II profile must enable shared libraries');
assert.match(source, /const cemuSupport = await installWiiUCemuSupport\(device\);[\s\S]*wiiu-keys/u, 'a Wii U setup must install Cemu support with its keys');
assert.match(source, /systems\.wiiu = await wiiUCemuSupportInstalled\(sftp, client\)/u, 'installed-state verification must include the Cemu support files');

console.log('PASS: Wii U setup bundles, installs, and verifies both Cemu libraries plus the Black Ops II profile.');
