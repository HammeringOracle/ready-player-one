const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "Ready Player One.html"), "utf8");

assert(!html.includes('class="hints"'), "The obsolete bottom-left control legend must be removed");
assert(!html.includes('<span class="key">START</span>MENU'), "START / MENU must not appear in the footer");
assert(!html.includes('<span class="key">A</span>SELECT'), "A / SELECT must not appear in the footer");
assert(!html.includes('<span class="key">B</span>BACK'), "B / BACK must not appear in the footer");
assert(!html.includes('<span class="key">F1</span>FILES'), "F1 / FILES must not appear in the footer");
assert(html.includes('id="footerTransferProgress"'), "The footer must contain overall transfer progress");

console.log("Footer control legend checks passed.");
