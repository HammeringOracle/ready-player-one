const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "Ready Player One.html"), "utf8");
for (const required of [
  "function romPlayableOnSelectedMachine",
  "playability-shield ${romPlayableOnSelectedMachine",
  ".cover.playability-shield.playable",
  ".cover.playability-shield.unplayable",
  "Playable on ${machineDisplayName(selectedDevice)}",
  "Not playable on ${machineDisplayName(selectedDevice)}"
]) {
  if (!html.includes(required)) throw new Error(`Missing universal playability shield behavior: ${required}`);
}
const iconBlock = html.slice(html.indexOf("function iconClass"), html.indexOf("function gameTitleWithoutExtension"));
if (/return\s+["`]file["`]/.test(iconBlock) || /return\s+["`]disc["`]/.test(iconBlock)) {
  throw new Error("iconClass still emits a legacy format icon.");
}
console.log("Universal ROM playability shield checks passed.");
