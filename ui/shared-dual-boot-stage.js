const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Transform, Writable } = require('node:stream');
const { inspectSharedDualBootImage } = require('./shared-dual-boot-image');

const IMAGE_BASE = 'batocera-x86_64-43.1-20260529.img';
const REFIND_NAME = 'refind-bin-0.14.2.zip';
const REFIND_SHA256 = '410c7828c4fec2f2179bd956073522415831d27c00416381b8f71153c190a311';
const REFIND_SOURCE = path.join(__dirname, '..', 'companions', 'ready-player-two', 'vendor', 'refind', REFIND_NAME);

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), new Writable({
    write(chunk, encoding, callback) { hash.update(chunk); callback(); }
  }));
  return hash.digest('hex');
}

async function copyFileVerified(source, temp, onProgress = () => {}) {
  const total = (await fs.promises.stat(source)).size;
  let copied = 0;
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(source), new Transform({
    transform(chunk, encoding, callback) {
      hash.update(chunk);
      copied += chunk.length;
      onProgress({ phase: 'copying', copiedBytes: copied, totalBytes: total });
      callback(null, chunk);
    }
  }), fs.createWriteStream(temp, { flags: 'wx' }));
  const sourceSha256 = hash.digest('hex');
  onProgress({ phase: 'verifying', copiedBytes: copied, totalBytes: total });
  if ((await fs.promises.stat(temp)).size !== total || await sha256File(temp) !== sourceSha256) {
    throw new Error('The image copied to Windows did not verify. No install request was created.');
  }
  return {sourceSha256,total};
}

async function stageSharedDualBootImage({ imagePath, host, targetComputerName, windowsGb, defaultOs, onProgress = () => {} }) {
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || host.includes('..')) throw new Error('Invalid Windows host.');
  if (!/^[a-zA-Z0-9_-]{1,63}$/.test(targetComputerName)) throw new Error('The Windows computer name is invalid.');
  if (!Number.isInteger(windowsGb) || windowsGb < 1) throw new Error('Choose a valid Windows partition size.');
  if (!['windows', 'batocera'].includes(defaultOs)) throw new Error('Choose a default boot OS.');
  const image = await inspectSharedDualBootImage(imagePath);
  const imageName = image.name.toLowerCase();
  if (![IMAGE_BASE, `${IMAGE_BASE}.gz`].includes(imageName)) throw new Error(`Choose ${IMAGE_BASE} or ${IMAGE_BASE}.gz.`);
  const stageRoot = `\\\\${host}\\RP2Stage`;
  const destination = path.win32.join(stageRoot, imageName);
  const temp = path.win32.join(stageRoot, `${imageName}.${crypto.randomUUID()}.partial`);
  const manifestPath = path.win32.join(stageRoot, 'plan.json');
  try {
    const sourceSha256 = await sha256File(image.path);
    const total = (await fs.promises.stat(image.path)).size;
    let existing = null;
    try { existing = await fs.promises.stat(destination); }
    catch (error) { if (!['ENOENT','UNKNOWN'].includes(error.code)) throw error; }
    if (existing) {
      let previousPlan = null;
      try { previousPlan = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8')); }
      catch (error) { if (!['ENOENT','UNKNOWN'].includes(error.code)) throw error; }
      if (existing.size !== total || previousPlan?.imageName !== imageName ||
          previousPlan.imageBytes !== total || previousPlan.imageSha256 !== sourceSha256 ||
          previousPlan.targetComputerName !== targetComputerName || previousPlan.status !== 'staged-only') {
        throw new Error('A different or unverified Batocera image is already staged on this Windows PC. RP1 will not overwrite it.');
      }
      onProgress({ phase: 'verifying', copiedBytes: total, totalBytes: total });
    } else {
      const copied = await copyFileVerified(image.path,temp,onProgress);
      if (copied.sourceSha256 !== sourceSha256 || copied.total !== total) throw new Error('The copied image differs from the selected local image.');
      await fs.promises.rename(temp, destination);
    }
    if (await sha256File(REFIND_SOURCE) !== REFIND_SHA256) throw new Error('The bundled rEFInd package did not pass its pinned SHA-256 check. No install request was created.');
    const refindDestination = path.win32.join(stageRoot, REFIND_NAME);
    const refindTemp = path.win32.join(stageRoot, `${REFIND_NAME}.${crypto.randomUUID()}.partial`);
    try {
      let refindExists = false;
      try { refindExists = (await fs.promises.stat(refindDestination)).isFile(); }
      catch (error) { if (!['ENOENT','UNKNOWN'].includes(error.code)) throw error; }
      if (refindExists) {
        if (await sha256File(refindDestination) !== REFIND_SHA256) throw new Error('A different rEFInd package is already staged. RP1 will not overwrite it.');
      } else {
        const verified = await copyFileVerified(REFIND_SOURCE, refindTemp);
        if (verified.sourceSha256 !== REFIND_SHA256) throw new Error('The rEFInd copy did not match its pinned SHA-256.');
        await fs.promises.rename(refindTemp, refindDestination);
      }
    } finally { await fs.promises.rm(refindTemp, { force: true }).catch(() => {}); }
    const plan = {
      schema: 1,
      imageName,
      imageBytes: total,
      imageSha256: sourceSha256,
      refindName: REFIND_NAME,
      refindSha256: REFIND_SHA256,
      targetComputerName,
      windowsGb,
      defaultOs,
      createdAt: new Date().toISOString(),
      status: 'staged-only'
    };
    const planTemp = path.win32.join(stageRoot, `plan.${crypto.randomUUID()}.partial`);
    try {
      await fs.promises.writeFile(planTemp, JSON.stringify(plan, null, 2), { flag: 'wx' });
      await fs.promises.rename(planTemp, manifestPath);
    } finally { await fs.promises.rm(planTemp, { force: true }).catch(() => {}); }
    onProgress({ phase: 'staged', copiedBytes: total, totalBytes: total });
    return plan;
  } finally {
    await fs.promises.rm(temp, { force: true }).catch(() => {});
  }
}

module.exports = { stageSharedDualBootImage, sha256File, copyFileVerified };
