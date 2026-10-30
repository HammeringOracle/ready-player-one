const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(html, /data-system="favorites"[^>]*>[\s\S]*?<span>Favorites<\/span>/, 'Favorites must be available in Consoles');
assert.match(html, /data-system="all"[^>]*>[\s\S]*?<span>All Games<\/span>/, 'All Games must be available in Consoles');
assert.match(html, /const virtualCollectionSystems = new Set\(\["all", "favorites"\]\)/, 'automatic collections must be explicitly treated as virtual');
assert.match(html, /No games, artwork, or favorite flags will be deleted/, 'disabling a collection must clearly be non-destructive');
assert.match(html, /await request\('\/api\/collections\/configure'/, 'console changes must update Batocera collection settings');
assert.match(html, /virtualCollectionSystems\.has\(selectedSystem\)[\s\S]*?installedControl/, 'collection games must not expose destructive installed-ROM checkboxes');
assert.match(server, /url\.pathname === "\/api\/collections\/configure"/, 'backend must expose automatic collection configuration');
assert.match(server, /CollectionSystemsAuto/, 'backend must preserve and update EmulationStation automatic collections');
assert.match(server, /values=\[x for x in values if x not in \('all','favorites'\)\]/, 'backend must replace only the two managed collection flags');

console.log('automatic collections tests passed');
