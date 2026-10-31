const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('Ready Player One.html', 'utf8');
const server = fs.readFileSync('ui/server.js', 'utf8');
const copyStart = html.indexOf('async function copyAllConsole');
const copyEnd = html.indexOf('\n    function closeConsoleTransferMenu', copyStart);
const copy = html.slice(copyStart, copyEnd > copyStart ? copyEnd : copyStart + 7000);

assert.match(copy, /activeLayoutNames[\s\S]*\.sort\(\(left, right\) => compareNaturalGameTitles\([\s\S]*displayTitleForFile\(system, left\)/, 'Copy All submits visible middle-pane order');
assert.match(server, /queueOrder, nextAttemptAt: 0/, 'enqueue persists each visible position');
assert.match(server, /const consoleQueue = queued[\s\S]*Number\(left\.queueOrder \|\| 0\) - Number\(right\.queueOrder \|\| 0\)/, 'dispatcher follows persisted top-to-bottom positions');
assert.match(server, /if \(jobIsSmall !== useSmallPool\) break;/, '4/10 batching never skips over a differently sized row');
console.log('PASS: Copy All starts in exact visible top-to-bottom order.');
