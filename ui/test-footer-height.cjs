const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "Ready Player One.html"), "utf8");
if (!html.includes("grid-template-rows: 54px 50px minmax(0, 1fr) 30px;")) {
  throw new Error("Desktop footer is not the requested 30px (40% reduction from 50px)." );
}
if (!/\.footer\s*\{\s*min-height:\s*30px;/s.test(html)) {
  throw new Error("Responsive footer still forces the old taller minimum height.");
}
console.log("Footer height checks passed.");
