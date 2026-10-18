const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "Ready Player One.html"), "utf8");
const appearance = fs.readFileSync(path.join(__dirname, "appearance.css"), "utf8");

assert(html.includes("grid-template-rows: 54px 50px minmax(0, 1fr) 50px;"), "The machine/settings header must be 50px high");
assert(html.includes("grid-template-rows: 30px minmax(0, 1fr);"), "The content grid must reserve a filter row");
assert(html.includes("row-gap: 12px;"), "The filter must have equal 12px spacing above and below");
assert(html.includes(".main > .device-filter"), "The filter must be positioned by the content grid");
assert(html.includes("grid-column: 2 / 4;"), "The filter must be centered over the middle and right panes");
assert(html.includes(".main > aside.panel:first-of-type"), "The console pane must retain an independent full-height grid placement");
assert(html.indexOf('<section class="main">') < html.indexOf('id="warehouseFilter"'), "The filter must live below the second header");
assert(html.indexOf('id="warehouseFilter"') < html.indexOf('<aside class="panel">'), "The filter must occupy its own row above the content panes");
assert(appearance.includes("grid-template-columns: minmax(190px, 1fr) auto 40px;"), "The settings header must no longer reserve a filter column");

console.log("Filter and second-header layout checks passed.");
