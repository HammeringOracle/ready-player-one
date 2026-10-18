const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');

assert.match(html, /id="openUsbImage"[^>]*>USB Image</u);
assert.match(html, /id="usbImageModal"/u);
assert.match(html, /id="usbImageSource"/u);
assert.match(html, /Balena Etcher/u);
assert.match(html, /api\/usb-image\/preflight/u);
assert.match(html, /api\/usb-image\/start/u);
assert.match(html, /api\/usb-image\/status/u);
assert.match(html, /api\/usb-image\/cancel/u);
assert.match(html, /id="usbImageConfirmModal"/u);
assert.match(html, /id="usbImageConfirmMessage"/u);
assert.match(html, /Create a complete \$\{formatBackupSize\(usbImagePreflight\.diskSize\)\} image of \$\{usbImagePreflight\.label \|\| machineDisplayName\(usbImageMachine\)\}\?/u);
assert.doesNotMatch(html, /window\.confirm\(`Create a complete/u);
assert.match(html, /sourceId:usbImagePreflight\.id/u);
assert.match(server, /const usbImagesPath = path\.join\(root, "USB Images"\)/u);
assert.match(server, /async function inspectLocalUsbImageSources/u);
assert.match(server, /BusType -eq 'USB'/u);
assert.match(server, /-not \$_.IsBoot -and -not \$_.IsSystem/u);
assert.match(server, /\\\\\\\\\.\\\\PhysicalDrive\$\{number\}/u);
assert.match(server, /function createLocalUsbImage/u);
assert.match(server, /source\.type === "local"/u);
assert.match(server, /findmnt -n -o SOURCE/u);
assert.match(server, /blockdev --getsize64/u);
assert.match(server, /dd if=\$\{source\.disk\} bs=4194304 status=none/u);
assert.match(server, /usbImageJob\.bytesWritten \+= chunk\.length/u);
assert.match(server, /fs\.statfsSync\(usbImagesPath\)/u);
assert.match(server, /usbImageJob\.bytesWritten !== source\.diskSize/u);
assert.match(server, /fs\.renameSync\(partial, source\.destination\)/u);

console.log('USB full-disk image workflow checks passed.');
