const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Medicine owns the prepared source. RP1 keeps a verified working cache.
module.exports = function createMedicinePs2Bios({ root, cachePath, spec, execSsh, installCached }) {
  const medicineRoot = ['Ready Player One Medicine', 'RP1 Medicine']
    .map(name => path.join(path.dirname(root), name))
    .find(folder => fs.existsSync(folder)) || path.join(path.dirname(root), 'Ready Player One Medicine');
  const source = path.join(medicineRoot, 'roms', 'ps2', spec.fileName);
  const destination = path.join(cachePath, spec.fileName);
  const valid = file => {
    try {
      const size = fs.statSync(file).size;
      return size > 0 && size <= spec.maxBytes && crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex') === spec.md5;
    } catch { return false; }
  };
  function cache() {
    if (valid(destination)) return destination;
    if (!valid(source)) return null;
    fs.mkdirSync(cachePath, { recursive: true });
    const temporary = `${destination}.medicine-import`;
    fs.copyFileSync(source, temporary);
    if (!valid(temporary)) { fs.unlinkSync(temporary); throw new Error('Medicine PS2 BIOS failed verification during import.'); }
    fs.renameSync(temporary, destination);
    return destination;
  }
  const pending = new Map();
  async function ensure(device, progress) {
    if (device.access !== 'ssh' || (device.platform && device.platform !== 'batocera')) return;
    const key = `${device.host}\0${device.user}`;
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      progress?.({ current: 'Checking PS2 BIOS from RP1 Medicine' });
      const remote = `${spec.remoteDir}/${spec.fileName}`;
      const checksum = await execSsh(device, `md5sum '${remote}' 2>/dev/null || true`, 15000);
      if (String(checksum).trim().split(/\s+/)[0] === spec.md5) return;
      if (!cache()) throw new Error(`PS2 BIOS required. Add verified ${spec.fileName} to Ready Player One Medicine\\roms\\ps2 before transferring PS2 games.`);
      progress?.({ current: 'Installing verified PS2 BIOS from RP1 Medicine' });
      await installCached(device, 'ps2');
      const installed = await execSsh(device, `md5sum '${remote}' 2>/dev/null || true`, 15000);
      if (String(installed).trim().split(/\s+/)[0] !== spec.md5) throw new Error('The machine-side PS2 BIOS failed checksum verification. The game was not transferred.');
    })();
    pending.set(key, task);
    try { await task; } finally { pending.delete(key); }
  }
  return { cache, ensure, source };
};
