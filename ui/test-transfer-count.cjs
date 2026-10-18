const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "Ready Player One.html"), "utf8");

assert(html.includes('footerTransferCount.textContent = `${movedFiles}/${totalFiles}`;'), "The footer must show completed files over total files");
assert(html.includes('footerTransferFill.style.width = `${overallPercent}%`;'), "The footer must show overall progress as a bar");
assert(!html.includes('id="openTransferActivity"'), "The footer transfer button must be removed");

console.log("Full transfer activity count checks passed.");
