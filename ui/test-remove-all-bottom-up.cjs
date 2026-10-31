const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('Ready Player One.html', 'utf8');
const start = html.indexOf('async function runConsoleRemoveAll');
const end = html.indexOf('\n    async function runWarehouseBulkQueue', start);
const source = html.slice(start, end);

assert(start >= 0 && end > start, 'Remove All implementation exists');
assert.match(source, /activeLayoutNames\(system, orderedItems\)\)\]\.reverse\(\)/, 'machine inventory is reversed from bottom to top');
assert.match(source, /removeGroup[\s\S]*Math\.min\(concurrency, items\.length\)/, 'Remove All retains parallel deletion workers');
assert.match(source, /for \(const completion of completed\)[\s\S]*await completion\.promise[\s\S]*commitRemovedGameRow/, 'visible rows commit through an ordered completion barrier');
assert.match(source, /small \? 10 : 4/, 'Remove All retains the 4/10 concurrency rule');
assert.match(html, /id="stopConsoleRemoval"[^>]*hidden>Stop Removal<\/button>/, 'middle-pane Stop Removal control exists');
assert.match(html, /consoleRemovalStopRequests\.add\(scope\)/, 'Stop Removal prevents additional workers from starting files');
assert.match(html, /title: 'Remove All'[\s\S]*message: `• Remove every installed[\s\S]*• Stop active and waiting[\s\S]*• Remove associated machine artwork/, 'Remove All confirmation uses a concise bullet list');
assert.match(html, /title: 'Remove All'[\s\S]*glassyActions: true/, 'Remove All confirmation uses shared glassy 3D actions');
console.log('PASS: Remove All runs in parallel while rows disappear strictly bottom-up.');
