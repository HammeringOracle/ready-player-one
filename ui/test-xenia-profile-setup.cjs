const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appearance = fs.readFileSync(path.join(__dirname, 'appearance.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert(!appearance.includes('Xenia (Xbox 360) Profile'));
assert(!appearance.includes('class="machine-behavior-xenia-profile"'));
assert(!appearance.includes('[data-control="xeniaProfile"]'));
assert(server.includes('async function openXbox360XeniaProfile(device)'));
assert(server.includes('batocera-config-xenia-canary'));
assert(server.includes('batocera-config-xenia-edge'));
assert(server.includes('Exit the Xbox 360 game first, then open profile setup.'));
assert(server.includes('url.pathname === "/api/xenia-profile/open"'));
assert(html.includes("xeniaProfileButton.textContent = 'Xenia (Xbox 360) Profile'"));
assert(html.includes("card.dataset.platform === 'batocera'"));
assert(html.includes("fetch('/api/xenia-profile/open'"));
console.log('Xenia profile setup controls passed.');
