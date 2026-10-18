const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "Ready Player One.html"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

assert(server.includes('job.artworkPercent = 0;'), "The picture stage must start with its own progress value");
assert(server.includes('progress(40, metadata ? "Picture match found" : "No Picture Matches — preparing default");'), "Picture matching must report whether a local cover was found");
assert(server.includes('progress(75, "No Picture Matches — copying default picture");'), "An unmatched game must visibly copy its hardcoded default picture");
assert(server.includes('progress(100, "No Picture Matches");'), "An unmatched picture stage must finish with No Picture Matches");
assert(html.includes("job.running && !job.completed"), "Only genuinely active work may render as a right-pane transfer");
assert(!html.includes("displayNow - Date.parse(job.finishedAt || 0) < 15000"), "Completed history must never masquerade as an upload on startup");
assert(html.includes("job.artworkPercent : job.percent"), "The right-pane bar must switch from ROM progress to picture progress");
assert(html.includes("defaultPictureStage ? 'Default Picture' : 'Picture'"), "An active unmatched picture copy must use the compact Default Picture label");
assert(html.includes("marker.textContent = '(No Picture Matches)';"), "The unmatched notice must remain on the installed game's right-pane row");
assert(html.includes("readyPlayerOne.noPictureMatches.v1"), "Persistent unmatched-picture results must survive a UI refresh");

console.log("Right-pane artwork progress checks passed.");
