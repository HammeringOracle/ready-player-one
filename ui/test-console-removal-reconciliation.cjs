const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(server,
  /const reconciledVisibleSystems = Array\.isArray\(savedVisibleSystems\) \? \[\.\.\.savedVisibleSystems\] : null/,
  'A saved RP1 Systems selection must remain authoritative during machine discovery.');
assert.doesNotMatch(server,
  /for \(const system of systems\) if \(!reconciledVisibleSystems\.includes\(system\)\) reconciledVisibleSystems\.push\(system\)/,
  'Discovery must not add Batocera folders the user never selected.');
assert.match(html,
  /catch \(error\) \{[\s\S]*?const restored = readVisibleSystems\(removal\.device\);[\s\S]*?restored\.add\(removal\.system\);[\s\S]*?api\/ui\/visible-systems/,
  'Any failed console removal must restore its local and server checkbox state.');
assert.doesNotMatch(html,
  /if \(removal\.system === 'steam'\)[\s\S]{0,400}restored\.add\('steam'\)/,
  'Removal recovery must not be limited to Steam.');

console.log('PASS: failed removals are restored without repopulating the left pane from Batocera folders.');
