const assert = require('node:assert/strict');
const fs = require('node:fs');
const {createOfflineAccount, readOfflineAccount, generateOfflineXuid, formatXuid} = require('./xenia-account');

const fixedRandom = () => Buffer.from('78563412', 'hex');
const xuid = generateOfflineXuid(fixedRandom);
assert.equal(formatXuid(xuid), 'E030000012345678');
const generated = createOfflineAccount('Player 1', {
  xuid,
  confounder: Buffer.from('0011223344556677', 'hex')
});
assert.equal(generated.account.length, 404);
assert.equal(generated.xuid, 'E030000012345678');
assert.deepEqual(readOfflineAccount(generated.account), {gamertag:'Player 1', onlineXuid:0n});
const corrupted = Buffer.from(generated.account);
corrupted[100] ^= 1;
assert.throws(() => readOfflineAccount(corrupted), /authentication/);
const xeniaManagerFixture = 'C:/Users/EF/AppData/Local/Temp/rp1-xenia-manager-e3aaf006456d46f589babe2ee49b334d/tests/XeniaManager.Tests/Assets/Account';
if (fs.existsSync(xeniaManagerFixture)) {
  assert.deepEqual(readOfflineAccount(fs.readFileSync(xeniaManagerFixture)), {gamertag:'Test Account', onlineXuid:0n});
}
console.log('Xenia offline account generation tests passed.');
