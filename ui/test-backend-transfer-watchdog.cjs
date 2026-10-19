const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const starter = fs.readFileSync(path.join(__dirname, "start-server.js"), "utf8");

for (const required of [
  "autoQueued: true",
  "async function dispatchPersistedTransferQueue()",
  "requestQueuedTransfer(job)",
  "const automaticTransferResume = setInterval",
  "job.autoQueued = false"
]) {
  if (!source.includes(required)) throw new Error(`Missing durable backend queue behavior: ${required}`);
}

if (source.includes("existing?.running || existing?.completed")) {
  throw new Error("Stale completed history can still suppress a newly requested transfer.");
}

if (!source.includes("Number(finalStats.size) === fileSize") || !source.includes("skippedFiles: 1")) {
  throw new Error("Existing same-size ROMs are not protected from retransmission.");
}

if (!starter.includes("readHealthWithRetry") || !starter.includes("await findWindowsPortOwner()")) {
  throw new Error("The source-backend launcher can still start a duplicate listener after a slow health probe.");
}

if (!source.includes("job.device === deviceName && (job.running || job.dispatching)")) {
  throw new Error("Dispatching transfers do not count against the per-machine concurrency limit.");
}

if (source.includes("concurrency - running.length")) {
  throw new Error("The queue watchdog can over-dispatch while loopback requests are still starting.");
}

if (!source.includes("job.dispatching ? { ...job, dispatching: false } : job")) {
  throw new Error("A stale dispatch hand-off can still strand a queued transfer after restart.");
}

console.log("Backend-owned transfer restart watchdog checks passed.");
