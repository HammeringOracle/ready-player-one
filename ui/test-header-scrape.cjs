const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert(html.includes('id="scrapeMissingPictures"'));
assert(html.includes('<span class="active-machine-name">On ${machineDisplayName(selectedDevice)}</span><button class="header-scrape"'));
assert(html.includes('async function scrapeMissingPictures()'));
assert(html.includes('systems: [system]'));
assert(html.includes('Picture lookup complete: ${matched} matched, ${unmatched} No Picture Matches'));
assert(server.includes('matchedFiles, unmatchedFiles, job: consoleScrapeJob'));
assert(server.includes('findLocalConsoleCover(system, fileName) ? matchedFiles : unmatchedFiles'));
assert(server.includes('runConsoleScrape(device, requested, true, body.device, "This PC")'));

console.log('Right-pane local picture retry checks passed.');
