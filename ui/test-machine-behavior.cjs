const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const appearance = fs.readFileSync(path.join(__dirname, 'appearance.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'appearance.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');

assert.match(css, /\.settings-card-grid\s*\{[^}]*grid-template-columns:repeat\(2/u, 'Settings cards must use two columns');
assert.doesNotMatch(appearance, /id="openMachineBehavior"/u, 'Machine Behavior must not remain in the general Settings cards');
assert.match(html, /Add \/ Update Credentials'[\s\S]*Machine Behavior'/u, 'Machine Behavior must appear directly below credentials in the machine menu');
assert.match(appearance, /window\.openMachineBehavior = device/u, 'Machine menu must be able to open behavior for its clicked machine');
assert.match(appearance, /machine-behavior-machines/u, 'Machine Behavior must show a machine selector');
assert.match(appearance, /Start screensaver after/u, 'screensaver timing must be configurable');
assert.match(appearance, /Put machine to sleep after/u, 'system sleep must be independently configurable');
assert.match(server, /platform === "batocera"[\s\S]*platform === "recalbox"[\s\S]*platform === "lakka"/u, 'Batocera, Recalbox, and Lakka must be mapped');
assert.match(server, /url\.pathname === "\/api\/machine-behavior"/u, 'Machine Behavior API must exist');
assert.match(server, /machineBehaviorStatePath/u, 'previous settings must be retained for restoration');
assert.match(server, /S31emulationstation stop[\s\S]*S31emulationstation start/u, 'EmulationStation settings must be applied across a clean frontend restart');

console.log('PASS: compact per-machine behavior controls are wired to the machine context menu.');
