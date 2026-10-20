const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const start = server.indexOf('function multiDiscBaseName');
const end = server.indexOf('function ensureMultiDiscPlaylists', start);
assert(start >= 0 && end > start, 'multi-disc grouping functions must exist');
const context = {
  path,
  localCoverKey: value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
};
vm.createContext(context);
vm.runInContext(`${server.slice(start, end)}; result = collapseLogicalMultiDiscEntries('xbox360', [
  'Lost Odyssey (World) (Disc 1).iso',
  'Lost Odyssey (World) (Disc 2).iso',
  'Lost Odyssey (World) (Disc 3).iso',
  'Lost Odyssey (World) (Disc 4).iso'
]);`, context);
assert.equal(context.result.length, 1);
assert.equal(context.result[0].name, 'Lost Odyssey (World) (Disc 1).iso');
assert.equal(context.result[0].type, '4 DISCS');
assert.equal(context.result[0].discSet.title, 'Lost Odyssey (World)');
assert.equal(context.result[0].discSet.files.length, 4);

for (const names of [
  ['Game - Disk 1.chd', 'Game - Disk 2.chd'],
  ['Game [CD1].cue', 'Game [CD2].cue'],
  ['Game DVD 1.iso', 'Game DVD 2.iso'],
  ['Game (Disc 1 of 3).bin', 'Game (Disc 2 of 3).bin', 'Game (Disc 3 of 3).bin']
]) {
  vm.runInContext(`result = collapseLogicalMultiDiscEntries('test', ${JSON.stringify(names)})`, context);
  assert.equal(context.result.length, 1, `${names[0]} should collapse to one game`);
  assert.equal(context.result[0].discSet.files.length, names.length);
}

assert(server.includes('return siblings.map(item => ({ name: item.name, localPath: path.join(folderPath, item.name) }))'));
assert(html.includes('function multiDiscInfo(item)'));
assert(html.includes('`${discSet.files.length} DISCS`'));
console.log('PASS: every console collapses multi-disc games and preserves the complete disc set');
