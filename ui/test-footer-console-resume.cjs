const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(
  html,
  /if \(footerInstalled\.has\(fileName\)\) completedSelectedKeys\.add\(fileName\);/,
  'Each console snapshot must count its confirmed installed filenames without aborting the progress refresh'
);
assert.doesNotMatch(
  html,
  /if \(footerInstalled\.has\(fileName\)\) completedSelectedKeys\.add\(key\);/,
  'The progress refresh must not reference an undefined key while switching consoles'
);
assert.match(
  html,
  /const scope = footerProgressScope\(device, system\);[\s\S]*?footerProgressByScope\.get\(scope\)/,
  'Console progress must be restored from its machine-and-console snapshot'
);

console.log('footer console resume test passed');
