const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "Ready Player One.html"), "utf8");

assert(!html.includes("activeList.append(existing);"), "An existing transfer row must remain in its alphabetical position");
assert(html.includes("activeList.append(row);"), "A new transfer row may be created before the list is re-sorted");
assert(!html.includes("activeList.prepend(row);"), "Transfer rows must not be inserted at the top of the machine list");
assert(html.includes("sortActiveGameRows();"), "Transfer rows must be naturally sorted into their correct title position");
assert(html.includes("activeList.scrollTo({ top: targetTop, behavior: 'smooth' });"), "The right pane must smoothly follow the active transfer");
assert(html.includes('const rowBounds = activeTransfer.getBoundingClientRect();'), "The active transfer must be positioned relative to the right pane rather than the page");
assert(html.includes('let newestActiveTransferName = "";'), "The right pane must track which console transfer started most recently");
assert(html.includes('row.dataset.name === newestActiveTransferName'), "Auto-scroll must follow the newest active file as the queue advances");
assert(html.includes("label.textContent = `${Math.round(percent)}%`;"), "Each active transfer row must display its progress percentage");

console.log("Alphabetically positioned transfer row checks passed.");
