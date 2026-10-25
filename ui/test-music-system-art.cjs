const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "Ready Player One.html"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const image = fs.readFileSync(path.join(__dirname, "system-art", "music.png"));

assert.match(html, /xbox360:"xbox360", music:"music"/, "MP3\/FLAC must request its bundled system artwork");
assert.match(server, /"xbox360", "music"/, "The system-art endpoint must allow the MP3\/FLAC asset");
assert.match(server, /music:\s*"https:\/\//, "MP3\/FLAC must be handled as supplemental bundled art");
assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "MP3\/FLAC artwork must be a valid PNG");

console.log("MP3/FLAC system-art regression test passed.");
