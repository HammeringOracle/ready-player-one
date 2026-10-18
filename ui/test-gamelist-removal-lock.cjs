const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
for (const required of [
  "const gamelistUpdateLocks = new Map()",
  "async function withGamelistUpdateLock",
  "removePublishedArtworkUnlocked",
  "return withGamelistUpdateLock(key",
  "uuid.uuid4().hex",
  "crypto.randomUUID()"
]) {
  if (!source.includes(required)) throw new Error(`Missing concurrent gamelist protection: ${required}`);
}
if (source.includes("temporary=gamelist+'.rp1-remove';")) {
  throw new Error("Remote gamelist removal still uses a shared temporary filename.");
}
console.log("Serialized gamelist removal checks passed.");
