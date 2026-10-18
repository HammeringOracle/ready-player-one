const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const queueSource = fs.readFileSync(path.join(__dirname, "artwork-publish-queue.js"), "utf8");

assert(source.includes("const artworkPublishLocks = new Map();"), "Concurrent ROM transfers must serialize artwork updates per machine and console");
assert(source.indexOf('os.replace(temporary,gamelist_path)') < source.indexOf("# The ROM and its local artwork are already durable now."), "The gamelist image link must be committed before attempting live registry synchronization");
assert(source.includes("if p not in known: continue"), "An unregistered live Batocera game must not block durable artwork publication");
assert(source.includes("except Exception: known={}"), "A temporarily unavailable Batocera game API must not block durable artwork publication");
assert(source.includes('if not os.path.isfile(media) or os.path.getsize(media)<1'), "Artwork completion must verify the copied image file");
assert(source.includes('if g.findtext(field)!=relative'), "Artwork completion must verify the gamelist image link");
assert(!source.includes('raise RuntimeError("Game not registered: "+p)'), "New ROM artwork must not fail merely because Batocera has not refreshed its live registry");
assert(source.includes("artworkPublishQueue.retryBatch"), "Pending artwork must be republished in batches instead of hundreds of individual SSH updates");
assert(source.includes("offset += 25"), "Artwork retry batches must remain bounded");
assert(queueSource.includes("for (const job of jobs) job.nextAttempt = 0;"), "Restarting RP1 must immediately release pending artwork from old retry delays");
assert(queueSource.includes("async retryBatch(ids)"), "The persistent artwork queue must support atomic batch retries");
assert(source.includes("async function execUploadedArtworkScript(device, script)"), "Artwork batches must upload their publisher script instead of relying on an oversized SSH command");
assert(source.includes("await execUploadedArtworkScript(device, publish);"), "Artwork publication must use the uploaded-script execution path");
assert(source.includes("await execUploadedArtworkScript(device, verify);"), "Artwork verification must use the uploaded-script execution path");
assert(source.includes("except ET.ParseError:"), "Artwork publication must repair a malformed Batocera gamelist instead of abandoning every queued image");
assert(source.includes('re.findall(r"<game(?:\\\\s[^>]*)?>.*?</game>",raw,re.S)'), "Malformed gamelist repair must salvage its complete game records");

console.log("Automatic atomic ROM artwork publication checks passed.");
