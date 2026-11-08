const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(server, /system === "movies" \? \[48, 42, 34, 27, 20, 13, 6\]/);
assert.match(server, /: \[34, 29, 24, 19, 14, 9, 4\];/);

console.log('Movies selector compensates for its six-column render scale to match N64 girth.');
