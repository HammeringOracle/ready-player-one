const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "Ready Player One.html"), "utf8");

assert(html.includes('id="warehouseAll" type="checkbox"'), "The center-pane header must contain an All checkbox");
assert(html.includes('<span class="warehouse-heading"><span>MAME Games</span><label class="warehouse-all-control">'), "All / Remove All must sit directly to the right of the console name");
const allControlRule = html.match(/\.warehouse-all-control\s*\{([^}]*)\}/)?.[1] || "";
assert(!allControlRule.includes("position: absolute"), "All / Remove All must no longer be independently centered");
assert(html.includes('function updateWarehouseAllControl()'), "The header checkbox must track the visible game selections");
assert(html.includes('allSelected ? "Remove All" : "All"'), "The label must change to Remove All when every game is selected");
assert(html.includes('const selectAll = control.dataset.action !== "remove";'), "The checked header control must remove every selection when used again");
assert(html.includes('title: selectAll ? "Confirm Upload All" : "Confirm Remove All"'), "Both All and Remove All must require confirmation");
assert(html.includes('const fileCount = changedGames.reduce'), "Bulk confirmation must calculate the exact number of affected files");
assert(html.includes('confirmLabel: selectAll ? `Upload ${fileCount}` : `Remove ${fileCount}`'), "Bulk confirmation buttons must display the affected file count");
assert(html.includes('alternateLabel: selectAll && removeAllFileCount ? "Remove All" : ""'), "The Upload All confirmation must also offer Remove All when files are currently selected");
assert(html.includes('const removeAllInstead = choice === "remove-all";'), "The Remove All choice must run the removal workflow rather than the upload workflow");
assert(html.includes('await runConsoleRemoveAll(selectedDevice, selectedSystem);'), "Remove All must remove the complete installed console inventory from the machine");
assert(html.includes('if (!choice) {'), "Cancelling a bulk confirmation must leave the current selections unchanged");
assert(html.includes('await syncWarehouseSelection(game, { device: queueDevice, system: queueSystem });'), "All and Remove All must use the normal scoped add/remove workflow for every game");
assert(html.includes('const WAREHOUSE_LARGE_FILE_BYTES = 50 * 1024 * 1024;'), "Bulk transfers must classify files at the 50 MB boundary");
assert(html.includes('await runWarehouseBulkQueue(smallGames, 10, true, true);'), "Files at or below 50 MB must use up to 10 simultaneous transfers");
assert(html.includes('await runWarehouseBulkQueue(largeGames, 4, true, true);'), "Files over 50 MB must use up to 4 simultaneous transfers");
assert(html.includes('data-size="${Number(item[7] || 0)}"'), "Rendered game rows must retain their exact file size for scheduling");
assert(html.includes('const attempts = selectAll ? 3 : 1;'), "Bulk additions must retry an item that fails to start instead of abandoning the remaining queue");
assert(html.includes('completed = await syncWarehouseSelection(game, { device: queueDevice, system: queueSystem });'), "The bulk scheduler must verify that every requested transfer actually starts in its original scope");
assert(html.includes('async function continueWarehouseSelectionQueue()'), "Saved checked games must reconstruct their transfer worker after a refresh or interruption");
assert(html.includes('const selectedNames = selectionSetFor(selectedSystem);'), "Queue reconstruction must use the saved per-machine console selections rather than transient checkbox state");
assert(html.includes('saveSelectionSet(selectedSystem, new Set(completeConsoleNames));'), "Select All must persist the complete local console library before beginning the first transfer");
assert(html.includes('await runWarehouseBulkQueue(smallGames, 10, true, true);'), "Automatically resumed small games must retain the 10-transfer limit");
assert(html.includes('await runWarehouseBulkQueue(largeGames, 4, true, true);'), "Automatically resumed large games must retain the 4-transfer limit");
assert(html.includes('await autoResumePersistedTransfers(selectedDevice);'), "Upload All must continue saved titles that were outside the rendered row window");
assert(html.includes('control.indeterminate = checked > 0 && !allSelected;'), "Partially selected lists must be represented correctly");

console.log("Center-pane All / Remove All checks passed.");
