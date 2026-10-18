const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(html, /\.device-game\[data-transfer-placeholder\]:not\([^)]*music[^)]*\)\s*\{\s*grid-template-columns: 18px minmax\(0, 1fr\);/, 'Transfer placeholders must give the filename the full flexible column');
assert.match(html, /const defaultPictureStage = artworkStage && \(job\.artwork\?\.matched === false \|\| \/default picture\|no picture matches\/i\.test\(job\.current \|\| ''\)\);/, 'Fallback-picture work must be detected without displaying the failure message');
assert.match(html, /defaultPictureStage \? 'Default Picture' : 'Picture'/, 'Active fallback copying must use the compact Default Picture label');
assert.match(html, /stage\.hidden = !stage\.textContent;/, 'Game-copy rows must reserve no status-label width');
assert.doesNotMatch(html, /stage\.textContent = job\.completed && job\.artwork\?\.matched === false\s*\? 'No Picture Matches'/, 'No Picture Matches must not appear inside an active transfer label');
assert.match(html, /marker\.textContent = '\(No Picture Matches\)'/, 'The completed dark-yellow marker must remain available after transfer completion');

console.log('transfer row label checks passed');
