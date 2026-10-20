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
assert(server.includes('!item.completed && !item.partialDeleted'), 'Only completed and deleted transfers must be excluded from restart recovery');
assert(server.includes('autoQueued: !wasStopping,') && server.includes('queuedAt: wasStopping ? "" : (job.queuedAt || new Date().toISOString())'), 'Interrupted uploads must resume automatically, but user-stopped uploads must stay stopped');
assert(server.includes('Math.min(99.9, Number(((job.transferredBytes / job.totalBytes) * 100).toFixed(1)))'), 'Sending every byte must not be reported as a completed transfer');
assert(server.includes('SFTP upload completion timed out.'), 'A stuck final SFTP acknowledgement must be recoverable');
assert(server.includes('sourceHash: runningSourceHash'), 'Health must identify the loaded backend so the launcher can replace stale code');
assert(server.includes('activeUploadCancels.get(transferKey)?.();'), 'Stopping a transfer must close its active upload connection instead of waiting for the next byte callback');
assert(html.includes('&& !job.cancelRequested\n            && !dismissedTransferKeys.has('), 'Cancelled uploads must not be painted back into the right pane');
assert(html.includes('job.running && !job.completed && !job.partialDeleted && !job.cancelRequested'), 'A transfer waiting to stop must not keep the console spinner active');
assert(html.includes('resumeGroup(small, 10)') && html.includes('resumeGroup(large, 4)'), 'Restart recovery must use size-based concurrency');
assert.match(html, /finally \{[\s\S]*?startupAutoResumeDevices\.delete\(device\);[\s\S]*?automaticResumeRunningDevices\.delete\(device\);/, 'A completed resume pass must release its in-flight guard so later queue entries can continue');
assert.match(html, /setTimeout\(continueWarehouseSelectionQueue, 250\)/, 'A drained visible batch must immediately check for more queued games');
assert(server.includes('resumablePutSftp'), 'Restarted uploads must retain partial-file byte resume support');
assert.match(server, /if \(client && localSize > 50 \* 1024 \* 1024 && remoteSize > 0 && remoteSize < localSize\)/, 'Only a real partial image should use the ordered SSH stream; fresh large images must use pipelined fastPut');
assert(server.includes('url.pathname === "/api/transfers/enqueue"'), 'Upload All must have a backend-persistent queue endpoint');
assert.match(html, /api\/transfers\/enqueue[\s\S]*?fileNames: changedGames\.map\(game => game\.dataset\.name\)[\s\S]*?await autoResumePersistedTransfers\(selectedDevice\)/, 'Upload All must persist the complete pending batch before starting its resume workers');

console.log('Restart transfer recovery checks passed.');
