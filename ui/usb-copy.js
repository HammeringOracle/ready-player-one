const fs = require('node:fs/promises');
const path = require('node:path');

async function copyFileResumableLocal(localFile, destination, onBytes) {
  await fs.mkdir(path.dirname(destination), {recursive:true});
  const localSize = (await fs.stat(localFile)).size;
  let existingSize = 0, exists = false;
  try { existingSize = (await fs.stat(destination)).size; exists = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (exists && existingSize === localSize) {
    onBytes?.(localSize, true, 0);
    return {skipped:true, bytes:localSize};
  }
  if (existingSize > localSize) existingSize = 0;
  const source = await fs.open(localFile, 'r');
  let target;
  try {
    target = await fs.open(destination, existingSize ? 'r+' : 'w');
    const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
    let position = existingSize;
    onBytes?.(position, false, 0);
    while (position < localSize) {
      const {bytesRead} = await source.read(buffer, 0, Math.min(buffer.length, localSize-position), position);
      if (!bytesRead) throw new Error(`Unexpected end of local file: ${localFile}`);
      let written = 0;
      while (written < bytesRead) {
        const {bytesWritten} = await target.write(buffer, written, bytesRead-written, position+written);
        if (!bytesWritten) throw new Error('USB write made no progress.');
        written += bytesWritten;
      }
      position += bytesRead;
      onBytes?.(position, false, bytesRead);
    }
    await target.sync();
  } finally {
    await Promise.all([source.close(), target?.close()]);
  }
  return {skipped:false, bytes:localSize};
}

module.exports = {copyFileResumableLocal};
