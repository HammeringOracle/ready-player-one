const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

requireText(html, '/api/transfers/cancel-system', 'UI must use the atomic console queue cancellation endpoint.');
requireText(html, 'Cancel Queue', 'A console with pending work must expose Cancel Queue.');
requireText(html, 'Completed games will not be deleted', 'Cancellation must clearly preserve completed games.');
requireText(server, 'url.pathname === "/api/transfers/cancel-system"', 'Server must provide console-wide cancellation.');
requireText(server, 'activeQueuedTransferSystem.delete(deviceName)', 'Cancellation must release the active console queue slot.');
requireText(server, 'job.cancelSystemRequested = true', 'Running jobs must be marked as console-wide cancellations.');
requireText(server, 'job.partialDeleted = true', 'Interrupted partial uploads must be cleaned up.');

console.log('Atomic console queue cancellation checks passed.');
