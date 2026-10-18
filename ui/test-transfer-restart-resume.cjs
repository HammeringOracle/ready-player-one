const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert(html.includes('/api/transfers/status?all=1&unfinished=1&device='), 'Startup recovery must request every unfinished transfer');
assert(html.includes('const savedSelections = readDeviceTransferSelections(device);'), 'Startup recovery must also restore queued selections that had not started');
assert(html.includes('if (!installed.has(fileName)) remaining.push('), 'Startup recovery must skip installed games and queue only the remainder');
assert(html.includes('await resumeSavedGroup(savedSmall, 10);'), 'Restored small-game queues must resume with ten workers');
assert(html.includes('await resumeSavedGroup(savedLarge, 4);'), 'Restored large-game queues must resume with four workers');
assert(html.includes('function repairLegacyRenderedAllSelections(device, library)'), 'Legacy Upload All repair must wait for the authoritative live library');
assert(html.includes('const renderedSubset = localNames.length >= names.length * 2'), 'A large rendered subset must be detected without relying on obsolete bundled ordering');
assert(html.includes('matchingNames >= Math.ceil(names.length * 0.8)'), 'Legacy recovery must tolerate titles removed during library cleanup');
assert(html.includes('const repairedLegacyQueue = repairLegacyRenderedAllSelections(selectedDevice, result.library);'), 'Legacy queue repair must run after the live library response arrives');
assert(html.includes('saved[system] = localNames;'), 'A detected rendered-only Upload All queue must be restored to the complete console library');
assert(html.includes('saveSelectionSet(selectedSystem, new Set(completeConsoleNames));'), 'Upload All must persist every local game, not only rendered rows');
assert(server.includes('url.searchParams.get("unfinished") === "1"'), 'The backend must expose the complete unfinished transfer set');
assert(server.includes('!item.completed && !item.partialDeleted && Number(item.percent || 0) < 100'), 'Completed and deleted transfers must not restart');
assert(html.includes('resumeGroup(small, 10)') && html.includes('resumeGroup(large, 4)'), 'Restart recovery must use size-based concurrency');
assert.match(html, /finally \{[\s\S]*?startupAutoResumeDevices\.delete\(device\);[\s\S]*?automaticResumeRunningDevices\.delete\(device\);/, 'A completed resume pass must release its in-flight guard so later queue entries can continue');
assert.match(html, /setTimeout\(continueWarehouseSelectionQueue, 250\)/, 'A drained visible batch must immediately check for more queued games');
assert(server.includes('resumablePutSftp'), 'Restarted uploads must retain partial-file byte resume support');
assert(server.includes('url.pathname === "/api/transfers/enqueue"'), 'Upload All must have a backend-persistent queue endpoint');
assert.match(html, /api\/transfers\/enqueue[\s\S]*?fileNames: changedGames\.map\(game => game\.dataset\.name\)[\s\S]*?await autoResumePersistedTransfers\(selectedDevice\)/, 'Upload All must persist the complete pending batch before starting its resume workers');

console.log('Restart transfer recovery checks passed.');
