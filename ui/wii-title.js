const fs = require('node:fs');

const cache = new Map();

function decodeTitle(buffer) {
  return buffer.subarray(0x20, 0x60)
    .toString('latin1')
    .replace(/\0.*$/s, '')
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = function readWiiTitle(filePath) {
  let stats;
  try { stats = fs.statSync(filePath); } catch { return ''; }
  if (!stats.isFile() || stats.size < 0x60) return '';
  const signature = `${stats.size}:${stats.mtimeMs}`;
  const cached = cache.get(filePath);
  if (cached?.signature === signature) return cached.title;

  let descriptor;
  let title = '';
  try {
    descriptor = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(512);
    fs.readSync(descriptor, header, 0, header.length, 0);
    let discOffset = 0;
    if (header.toString('ascii', 0, 4) === 'WBFS') {
      const sectorShift = header[9];
      if (sectorShift < 9 || sectorShift > 31) throw new Error('Invalid WBFS sector size');
      const discIndex = header.subarray(12).find(value => value !== 0);
      if (!discIndex) throw new Error('WBFS contains no disc');
      discOffset = discIndex * (2 ** sectorShift);
    }
    const discHeader = Buffer.alloc(0x60);
    fs.readSync(descriptor, discHeader, 0, discHeader.length, discOffset);
    const discId = discHeader.subarray(0, 6).toString('ascii');
    if (/^[A-Z0-9]{6}$/i.test(discId)) title = decodeTitle(discHeader);
  } catch {
    title = '';
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  cache.set(filePath, { signature, title });
  return title;
};
