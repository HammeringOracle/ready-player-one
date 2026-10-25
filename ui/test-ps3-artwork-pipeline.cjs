const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

assert(!source.includes("cachePs3DiscArtwork("),
  "PS3 artwork must not call the removed/nonexistent one-off cache function");
assert.match(source,
  /localPs1Artwork \|\| localPs2Artwork \|\| localPs3Artwork \|\| localPs4Artwork/,
  "PS3 must use the same proven local disc-art pipeline as the other disc consoles");
assert.match(source,
  /image = await cacheNesPictureArtwork\(metadata\.localImagePath, fileName, system\);/,
  "Matched PS3 covers must be converted and published through the universal disc-art cache");

console.log("PS3 artwork pipeline regression test passed.");
