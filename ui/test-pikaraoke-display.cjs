const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

assert.match(source, /<fullname>PiKaraoke<\/fullname>/u);
assert.doesNotMatch(source, /<fullname>PiKaraoke \(Beta\)<\/fullname>/u);
assert.match(source, /<image>\.\/media\/images\/pikaraoke\.png<\/image>/u);
assert.match(source, /<thumbnail>\.\/media\/images\/pikaraoke\.png<\/thumbnail>/u);
assert.match(source, /<marquee>\.\/media\/images\/pikaraoke\.png<\/marquee>/u);
assert.match(source, /fastPutSftp\(sftp, iconPath, "\/userdata\/roms\/pikaraoke\/media\/images\/pikaraoke\.png"\)/u);
assert.match(source, /const required = \["console", "label", "theme", "launcher", "launcher_v12", "entry", "image"/u);

console.log("PiKaraoke Batocera label and launch-icon checks passed.");
