const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "Ready Player One.html"), "utf8");

assert(html.includes(".active-device-list.empty-state {"), "The machine list needs a dedicated empty-state layout");
assert(/\.active-device-list\s*\{[\s\S]*?flex:\s*1 1 auto;/.test(html), "The right-pane list must fill the space beneath its header for true vertical centering");
assert(html.includes("align-items: center;"), "The empty message must be vertically centered");
assert(html.includes("justify-content: center;"), "The empty message must be horizontally centered");
assert(html.includes('const empty = message === "No games found for this system on this machine.";'), "The no-games message must use the centered status position");
assert(html.includes('const loading = message.startsWith("Loading");'), "Loading-library messages must use the centered status position");
assert(html.includes('const centered = reconnecting || loading || empty;'), "Connecting, loading, and no-games states must share one centered position");
assert(html.includes('activeList.classList.toggle("empty-state", centered);'), "The right pane must activate and clear its centered status state automatically");
assert(html.includes('if (empty) note.classList.add("is-empty");'), "The no-games status must be distinguishable from connection and loading messages");
assert(html.includes('if (empty && activeList.querySelector(".device-game"))'), "The no-games status must not be shown over an existing ROM row");
assert(html.includes("activeList.querySelector('.library-connection-message.is-empty')?.remove();"), "Pending or installed ROM rows must clear a stale no-games status");
assert(html.includes('transform: translate(-50%, -50%);'), "Centered right-pane status messages must share the same horizontal and vertical center point");

console.log("Centered right-pane empty-state checks passed.");
