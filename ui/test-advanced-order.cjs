const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');
const installed = fs.readFileSync(path.join(__dirname, 'installed-features-ui.js'), 'utf8');
const menu = html.match(/<div class="advanced-menu" id="advancedMenu">([\s\S]*?)<\/div>/u)?.[1] || '';
const labels = [...menu.matchAll(/<button[^>]*>([^<]+)<\/button>/gu)].map(match => match[1].replace(/&amp;/g, '&').trim());

assert.deepEqual(labels, [
  'Ready Player Two',
  'Back Up & Restore',
  'Music over Games',
  'Pygame CE',
  'Remapper',
  'Scraper (Music)',
  'Console Snapshots',
  'USB Controller',
  'USB Image'
]);
assert.match(installed, /medicine-installed[\s\S]*return 0/u, 'RP1 Medicine has first priority');
assert.match(installed, /openReadyPlayerTwo'[\s\S]*return 1/u, 'Ready Player Two has second priority');
assert.match(installed, /localeCompare/u, 'remaining Advanced Features are alphabetized');

console.log('Advanced Features priority and alphabetical-order checks passed.');
