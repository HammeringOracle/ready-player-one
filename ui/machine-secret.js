const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const dataRoot = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'Ready Player One')
  : path.join(os.homedir(), '.config', 'ready-player-one');
const keyPath = path.join(dataRoot, 'credential.key');
const priorDataRoot = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'Rec Room')
  : path.join(os.homedir(), '.config', 'rec-room');
const priorKeyPath = path.join(priorDataRoot, 'credential.key');
const legacyKeyPath = path.join(__dirname, '..', '.rec-room-credential-key');

function key() {
  try { return Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'base64'); }
  catch {
    fs.mkdirSync(dataRoot, {recursive: true, mode: 0o700});
    const migrationKeyPath = [priorKeyPath, legacyKeyPath].find(candidate => fs.existsSync(candidate));
    if (migrationKeyPath) {
      const existing = fs.readFileSync(migrationKeyPath, 'utf8').trim();
      fs.writeFileSync(keyPath, existing, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
      try { fs.chmodSync(keyPath, 0o600); } catch {}
      return Buffer.from(existing, 'base64');
    }
    const value = crypto.randomBytes(32);
    fs.writeFileSync(keyPath, value.toString('base64'), {encoding: 'utf8', mode: 0o600, flag: 'wx'});
    try { fs.chmodSync(keyPath, 0o600); } catch {}
    return value;
  }
}

module.exports = function secret(mode, value) {
  if (!['Protect', 'Unprotect'].includes(mode)) throw new Error('Invalid credential operation');
  if (mode === 'Protect') {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    return `rr1:${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')}`;
  }
  if (!String(value).startsWith('rr1:')) {
    if (process.platform !== 'win32') throw new Error('This saved credential uses the former Windows-only format. Enter it once more to migrate it.');
    const script = '$s=[Console]::In.ReadToEnd(); Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String($s); $r=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($r))';
    try { return execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], {input:value,encoding:'utf8',windowsHide:true,timeout:10000,stdio:['pipe','pipe','pipe']}); }
    catch { throw new Error('Enter this machine credential again to migrate it to the universal format.'); }
  }
  try {
    const payload = Buffer.from(String(value).slice(4), 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
  } catch { throw new Error('This computer cannot decrypt the saved machine credential. Enter it again.'); }
};
