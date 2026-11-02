const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
assert(html.includes('class="machine-connection-symbols"'));
assert(html.includes('"usb-c": Boolean(status?.usb)'));
assert(html.includes('ethernet: Boolean(status?.directDisplayConnected || status?.directDisplayConfigured)'));
assert(html.includes('wifi: Boolean(online && !status?.usb)'));
assert(html.includes('Connections: ${visibleConnections.join(", ")}'));
assert(html.includes('data-connection="wifi"'));
assert(html.includes('data-connection="ethernet"'));
assert(html.includes('data-connection="usb-c"'));
assert(html.includes('const visible = type === "wifi" || connectionStates[type];'));
assert(html.includes('symbol.classList.toggle("inactive", type === "wifi" && !connectionStates[type]);'));
assert(html.includes('.machine-connection-symbol.inactive'));
console.log('PASS: machine cards expose simultaneous USB Type-C, Ethernet display, and Wi-Fi symbols.');
