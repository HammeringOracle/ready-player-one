const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const EXPECTED_NAME = 'batocera-x86_64-43.1-20260529.img';
const PROBE_BYTES = 2 * 1024 * 1024;

function readImagePrefix(filePath, compressed) {
  if (!compressed) {
    const fd = fs.openSync(filePath, 'r');
    try {
      const data = Buffer.alloc(PROBE_BYTES);
      const length = fs.readSync(fd, data, 0, data.length, 0);
      return Promise.resolve(data.subarray(0, length));
    } finally { fs.closeSync(fd); }
  }
  return new Promise((resolve, reject) => {
    const source = fs.createReadStream(filePath);
    const unzip = zlib.createGunzip();
    let chunks = [], length = 0, settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      source.destroy();
      unzip.destroy();
      reject(error);
    };
    source.on('error', fail);
    unzip.on('error', fail);
    unzip.on('data', chunk => {
      if (settled) return;
      chunks.push(chunk); length += chunk.length;
      if (length >= PROBE_BYTES) {
        settled = true;
        const data = Buffer.concat(chunks, length).subarray(0, PROBE_BYTES);
        source.destroy(); unzip.destroy();
        chunks = [];
        resolve(data);
      }
    });
    unzip.on('end', () => { if (!settled) fail(new Error('The image is too small to inspect its boot partition.')); });
    source.pipe(unzip);
  });
}

function parseGpt(prefix) {
  if (prefix.length < PROBE_BYTES || prefix.readUInt16LE(510) !== 0xaa55 || prefix.toString('ascii', 512, 520) !== 'EFI PART') {
    throw new Error('The image does not contain the expected GPT partition table.');
  }
  const sectorSize = 512;
  const entriesLba = Number(prefix.readBigUInt64LE(512 + 72));
  const entryCount = prefix.readUInt32LE(512 + 80);
  const entrySize = prefix.readUInt32LE(512 + 84);
  if (entriesLba < 2 || entriesLba > 16 || entryCount < 2 || entryCount > 4096 || entrySize < 128 || entrySize > 1024) {
    throw new Error('The image has an unsupported GPT partition layout.');
  }
  const partitions = [];
  for (let index = 0; index < Math.min(entryCount, 16); index++) {
    const offset = entriesLba * sectorSize + index * entrySize;
    if (offset + entrySize > prefix.length) throw new Error('The image partition table is incomplete.');
    if (prefix.subarray(offset, offset + 16).every(value => value === 0)) continue;
    const firstLba = prefix.readBigUInt64LE(offset + 32);
    const lastLba = prefix.readBigUInt64LE(offset + 40);
    if (firstLba < 34n || lastLba < firstLba || lastLba > BigInt(Number.MAX_SAFE_INTEGER) / BigInt(sectorSize)) throw new Error('The image has an invalid partition boundary.');
    const name = prefix.toString('utf16le', offset + 56, offset + 128).replace(/\0.*$/, '');
    partitions.push({number:index + 1,name,startLba:Number(firstLba),endLba:Number(lastLba),sizeBytes:Number(lastLba - firstLba + 1n) * sectorSize});
  }
  if (partitions.length !== 2 || partitions[0].name.toLowerCase() !== 'vfat' || partitions[1].name.toLowerCase() !== 'userdata') {
    throw new Error('The image must contain Batocera boot and userdata partitions.');
  }
  if (partitions[0].endLba >= partitions[1].startLba || partitions[0].sizeBytes < 8 * 1024 ** 3) {
    throw new Error('The Batocera boot and userdata partition layout is unsupported.');
  }
  const bootOffset = partitions[0].startLba * sectorSize;
  if (bootOffset + 512 > prefix.length || prefix.readUInt16LE(bootOffset + 510) !== 0xaa55 || prefix.toString('ascii', bootOffset + 82, bootOffset + 87) !== 'FAT32') {
    throw new Error('The Batocera boot partition is not FAT32 as expected.');
  }
  return partitions;
}

async function inspectSharedDualBootImage(imagePath) {
  const resolved = path.resolve(String(imagePath || ''));
  const name = path.basename(resolved).toLowerCase();
  if (name !== EXPECTED_NAME && name !== `${EXPECTED_NAME}.gz`) throw new Error(`Choose ${EXPECTED_NAME} or ${EXPECTED_NAME}.gz.`);
  const info = fs.statSync(resolved);
  if (!info.isFile() || info.size < 1024 * 1024) throw new Error('The selected image is not a valid-sized file.');
  const compressed = name.endsWith('.gz');
  const partitions = parseGpt(await readImagePrefix(resolved, compressed));
  return {path:resolved,name,sizeBytes:info.size,compressed,modifiedAt:info.mtime.toISOString(),partitions};
}

module.exports = {inspectSharedDualBootImage};
