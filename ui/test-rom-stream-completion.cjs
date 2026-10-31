const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');
const { Server, Client } = require('ssh2');
const code = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const upload = new Function('fs', 'shellSingleQuoted', code.slice(
  code.indexOf('function streamRomOverSshLegacy('),
  code.indexOf('async function resumablePutSftp(')
) + '; return streamRomOverSshLegacy;')(fs, value => `'${value}'`);
const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  .export({ type: 'pkcs1', format: 'pem' });
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rp1-stream-test-'));
const file = path.join(folder, 'rom');
const payload = Buffer.alloc(2 * 1024 * 1024, 123);
fs.writeFileSync(file, payload);
const client = new Client();
const peers = new Set();
let cleaningUp = false;
const server = new Server({ hostKeys: [key] }, peer => {
  peers.add(peer);
  peer.on('error', error => { if (!cleaningUp) throw error; });
  peer.on('authentication', ctx => ctx.accept()).on('ready', () => {
    peer.on('session', accept => accept().on('exec', (accept, reject, info) => {
      const channel = accept();
      const expected = Number(/head -c (\d+)/.exec(info.command)[1]);
      let bytes = 0;
      channel.on('data', chunk => {
        assert.ok(chunk.every(value => value === 123));
        bytes += chunk.length;
        if (bytes === expected) { channel.exit(0); channel.end(); }
      });
    }));
  });
});
(async () => {
  const timeout = setTimeout(() => { console.error('Completion stalled'); process.exit(1); }, 6000);
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await new Promise((resolve, reject) => client.once('ready', resolve).once('error', reject)
      .connect({ host: '127.0.0.1', port: server.address().port, username: 'test' }));
    for (const offset of [0, 256 * 1024]) {
      let progress = 0;
      await upload(client, file, '/test', offset, payload.length, bytes => { progress = bytes; });
      assert.equal(progress, payload.length);
    }
    console.log('PASS: fresh and resumed SSH uploads finish without stdout.');
  } finally {
    cleaningUp = true;
    clearTimeout(timeout); client.destroy();
    for (const peer of peers) peer.end();
    server.close(); fs.rmSync(folder, { recursive: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
