const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const match = source.match(/function consoleArtworkRomPath\(system, fileName\) \{[\s\S]*?\n\}/u);
assert(match, 'Xbox 360 artwork path resolver must exist');

const context = {
  path,
  safeLocalRomPath: (_system, fileName) => `C:\\roms\\${fileName}`,
  fs: { statSync: () => ({ isDirectory: () => true }) },
  listLocalFilesRecursive: () => ['Perfect Dark (World) (XBLA)/584109C2/000D0000/Perfect Dark.xbox360']
};
vm.runInNewContext(`${match[0]}; result = consoleArtworkRomPath('xbox360', 'Perfect Dark (World) (XBLA)')`, context);
assert.equal(context.result, 'Perfect Dark (World) (XBLA)/Perfect Dark (World) (XBLA)/584109C2/000D0000/Perfect Dark.xbox360');

context.listLocalFilesRecursive = () => [];
vm.runInNewContext("result = consoleArtworkRomPath('xbox360', 'Halo 3.iso')", context);
assert.equal(context.result, 'Halo 3.iso');

assert(source.includes('request("/addgames/"+system,ET.tostring(wrapper),"application/xml")'));
assert(source.includes('launcher_roots='), 'Old folder-level Xbox 360 metadata must be removed');
assert(source.includes('\nif system=="xbox360":\n'), 'Xbox 360 cleanup must not be nested inside PS4 handling');
assert(source.includes('\nby_relative={g.findtext("path"):g for g in gamelist.findall("game")}\nfor entry in entries:'), 'All systems must initialize the gamelist path index before publishing');
console.log('Xbox 360 nested-launcher artwork checks passed.');
