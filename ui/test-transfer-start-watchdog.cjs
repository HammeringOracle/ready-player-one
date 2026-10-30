const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

for (const required of [
  'const waitingForFirstProgress',
  'Number(job.transferredBytes || 0) === 0',
  'Number(job.completedFiles || 0) === 0',
  'const idleLimitMs = waitingForFirstProgress ? 30000 : 150000',
  'activeUploadCancels.get(transferKey)?.()',
  'connectionProgress?.(attempt === 0',
  'Reconnecting to machine (attempt ${attempt + 1} of ${maxAttempts})',
  'setImmediate(() => dispatchPersistedTransferQueue()',
  'Date.now() - backendStartedAt < 1500',
  '}, 1000);'
]) {
  if (!server.includes(required)) throw new Error(`Missing startup watchdog behavior: ${required}`);
}

console.log('Fast transfer-start watchdog checks passed.');
