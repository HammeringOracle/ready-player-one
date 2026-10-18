const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "Ready Player One.html"), "utf8");

assert(html.includes('.library-connection-message.is-reconnecting {'), "Reconnecting must have a dedicated compact style");
assert(html.includes('min-height: 28px;'), "Reconnecting must use the reduced message height");
assert(html.includes('padding: 7px 18px !important;'), "Reconnecting vertical padding must be reduced by about half");
assert(html.includes('justify-content: center;'), "Reconnecting must be centered over the game rows");
assert(html.includes('note.classList.add("is-reconnecting")'), "Only reconnecting messages should receive the compact centered treatment");
assert(html.includes('const centered = reconnecting || loading || empty;'), "Reconnecting must share the same center point as loading and no-games messages");

console.log("Compact centered reconnecting-message checks passed.");
