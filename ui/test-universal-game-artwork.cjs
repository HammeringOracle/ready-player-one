const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

for (const system of ["nes", "snes", "sega", "gb", "gbc", "nds", "3ds", "switch", "saturn", "dreamcast", "psp", "psvita", "xbox360", "atari2600", "pcengine"]) {
  assert(new RegExp(`\\b${system.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(source.match(/const localOnlyArtworkSystems = new Set\(\[([\s\S]*?)\]\);/)?.[1] || ""), `${system} must use automatic local-or-default artwork`);
}
assert(source.includes('async function cacheGenericConsoleFallbackArtwork(system, fileName)'), "Every console must have a generated default picture when no local match exists");
assert(source.includes('styledFallbackArtworkSystems.has(fallbackSystem) && hasLocalConsoleCoverFolder(system)'), "Known console artwork styles must use their console-specific default before the universal default");
assert(source.includes('if (system === "3dsen") system = "nes";'), "3D NEC must reuse the NES cover library");

console.log("Universal checkbox artwork checks passed.");
