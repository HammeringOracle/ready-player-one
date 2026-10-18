const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');

assert(!server.includes('serverSessionStartedAt'), 'Pending reset state must not expire merely because RP1 restarted');
assert(server.includes('Number(job.completedFiles || 0) > Number(job.skippedFiles || 0)'));
assert(server.includes('function clearSoftResetNeededForGame(deviceName, system, fileName)'));
assert(server.includes('addedGames.add(softResetGameKey(system, fileName))'));
assert(server.includes('pendingResetGames: softResetPendingGames(machineId, system)'));
assert(server.includes('return Boolean(entry && Array.isArray(entry.addedGames) && entry.addedGames.length);'), 'Pending uploads must survive an RP1 restart until Soft Reset succeeds');
assert(!server.includes('Date.parse(entry.finishedAt || 0) < serverSessionStartedAt'), 'Pending yellow titles must not be cleared by a backend session boundary');
assert(html.includes('.device-game.pending-soft-reset > span:not(.badge)'));
assert(html.includes('rememberPendingResetGame(targetDevice, targetSystem, fileName)'));
assert(html.includes('clearPendingResetGames(selectedDevice)'));
assert(server.includes('clearSoftResetNeededForGame(body.device, body.system, body.fileName)'));
assert(server.includes('resetNeeded: isSoftResetNeeded(body.device)'));
assert(html.includes('readyPlayerOne.softResetNeeded.v6'));
assert(html.includes('function completedGameUpload(job)'));
assert(html.includes('Number(job?.skippedFiles || 0) < total'));
assert(html.includes('const backendOwnsResetState = Object.prototype.hasOwnProperty.call(result, "resetNeeded")'));
assert(html.includes('if (!backendOwnsResetState)'));
assert(html.includes('const resetSystem = selectedSystem'));
assert(html.includes('status?.instanceId || card.dataset.instanceId || deviceStorageIdentity(deviceId)'));
assert(html.includes('softResetDevice.textContent = machineDisplayName(selectedDevice)'));
assert(html.includes('`Resetting ${machineDisplayName(selectedDevice)}...`'));
assert(html.includes('setSoftResetNeeded(Boolean(result.resetNeeded), requestDevice)'));
assert(!html.includes('softResetDevice.textContent = selectedDevice'));
assert(!html.includes('if (reconnecting) activeList.innerHTML = ""'));
assert(!html.includes('const recentCutoff = Date.now() - 15 * 60 * 1000'));

console.log('Machine-scoped, completed-upload-only Soft Reset tests passed.');
