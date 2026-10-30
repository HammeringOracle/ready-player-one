const fs = require("node:fs");
const path = require("node:path");

const root = path.join(path.dirname(__dirname), "roms", "gamecube");
const clean = name => name
  .replace(/\s*\(USA\)/g, "")
  .replace(/\s*\(En,Fr,De,Es,It\)/g, "")
  .replace(/\s*\(Rev(?:ision)?\s*[^)]*\)/gi, "")
  .replace(/\s+(?=\.[^.]+$)/, "")
  .trim();

const entries = fs.readdirSync(root, { withFileTypes: true });
const changes = entries
  .map(entry => ({ oldName: entry.name, newName: clean(entry.name), directory: entry.isDirectory() }))
  .filter(change => change.oldName !== change.newName);

for (const change of changes) {
  const destination = path.join(root, change.newName);
  if (fs.existsSync(destination)) throw new Error(`Rename collision: ${change.oldName} -> ${change.newName}`);
}

const replacements = new Map(changes.map(change => [change.oldName, change.newName]));
let playlistsUpdated = 0;
for (const entry of entries) {
  if (entry.isDirectory() || path.extname(entry.name).toLowerCase() !== ".m3u") continue;
  const source = path.join(root, entry.name);
  const original = fs.readFileSync(source, "utf8");
  const updated = original.split(/(\r?\n)/).map(part => replacements.get(part.trim()) || part).join("");
  if (updated !== original) {
    const temporary = `${source}.rp1-rename`;
    fs.writeFileSync(temporary, updated, "utf8");
    fs.renameSync(temporary, source);
    playlistsUpdated += 1;
  }
}

for (const change of changes) fs.renameSync(path.join(root, change.oldName), path.join(root, change.newName));

const manifest = path.join(path.dirname(__dirname), `gamecube-region-tag-renames-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(manifest, `${JSON.stringify({ changes, playlistsUpdated }, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ renamed: changes.length, playlistsUpdated, manifest })}\n`);
