const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "Ready Player One.html"), "utf8");

assert(html.includes("let selectTopSystemOnNextVisibleList = true;"), "Startup must request the top visible console");
assert(html.includes("const first = list.querySelector('.row:not([hidden])');"), "The default must use the actual sorted top row");
assert(html.includes("(selectTopSystemOnNextVisibleList && first)"), "The first populated console list must select its top row");
assert(html.includes("selectTopSystemOnNextVisibleList = true;\n      applyVisibleSystems(readVisibleSystems());"), "Loading another machine must default to that machine's top console");
assert(html.includes('selectTopSystemOnNextVisibleList = false;\n        rows.forEach(row => row.classList.remove("active"));'), "Manual console choices must stop default reselection");
assert(!html.includes('selectedSystem = first.dataset.system;\n          selectTopSystemOnNextVisibleList = false;'), "An incomplete discovery list must not prematurely lock the default selection");

console.log("Topmost default-console selection checks passed.");
