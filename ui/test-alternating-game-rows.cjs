const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "Ready Player One.html"), "utf8");
for (const selector of [
  ".game:nth-child(even of .game)",
  ".device-game:nth-child(even of .device-game)"
]) {
  if (!html.includes(selector)) throw new Error(`Missing robust alternating-row selector: ${selector}`);
}
if (!html.includes("background-color: rgba(255, 255, 255, 0.085)")) {
  throw new Error("Alternating rows do not use the requested lighter background.");
}
if (!html.includes("#activeList > .device-game:nth-of-type(even)")) {
  throw new Error("The right pane is missing its embedded-browser alternating-row fallback.");
}
console.log("Alternating middle/right game row checks passed.");
