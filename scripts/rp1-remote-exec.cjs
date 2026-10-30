const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

const root = path.resolve(__dirname, '..');
const deviceName = process.argv[2];
const command = process.argv.slice(3).join(' ');
if (!deviceName || !command) {
  console.error('Usage: node scripts/rp1-remote-exec.cjs "Device Name" "command"');
  process.exit(2);
}
const settings = JSON.parse(fs.readFileSync(path.join(root, 'device-settings.json'), 'utf8'))[deviceName];
if (!settings) throw new Error(`Unknown device: ${deviceName}`);
const password = require(path.join(root, 'ui', 'machine-secret'))('Unprotect', settings.sshPasswordProtected);
const client = new Client();
client.on('ready', () => client.exec(command, (error, stream) => {
  if (error) throw error;
  stream.pipe(process.stdout);
  stream.stderr.pipe(process.stderr);
  stream.on('close', code => {
    client.end();
    process.exitCode = code;
  });
}));
client.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
client.connect({
  host: settings.discoveredHost || settings.host,
  username: settings.sshUsername,
  password,
  readyTimeout: 8000
});
