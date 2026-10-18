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

if (!starter.includes('"EACCES", "EPERM"')) {
  throw new Error("The source-backend launcher still aborts on a recoverable Windows loopback probe failure.");
}

console.log("Backend-owned transfer restart watchdog checks passed.");
