const fs = require("node:fs");
const path = require("node:path");
const cleanRomName = require("./rom-name");

const root = path.dirname(__dirname);
const romDirectory = path.join(root, "roms", "snes");
const coverDirectory = path.join(root, "covers", "snes");
const apply = process.argv.includes("--apply");
const romExtensions = new Set([".smc", ".sfc", ".fig", ".swc", ".zip", ".7z"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function key(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function titleKeys(value) {
  const cleaned = cleanRomName(value).replace(/(?:front|picture|label|cover|boxart|box|artwork|image)$/i, "").trim();
  const withoutEdition = cleaned.replace(/\s+(?:remaster(?:ed)?|definitive edition|complete edition|game of the year edition|goty edition|gold edition|deluxe edition|ultimate edition)$/i, "").trim();
  const singularized = withoutEdition.split(/\s+/).map(word =>
    /[a-z]{4,}s$/i.test(word) && !/(?:ss|us|is)$/i.test(word) ? word.slice(0, -1) : word
  ).join(" ");
  const result = new Set();
  for (const title of [cleaned, withoutEdition, singularized].filter(Boolean)) {
    result.add(key(title));
    const reversed = title.match(/^(.+),\s*(a|an|the)$/i);
    if (reversed) result.add(key(`${reversed[2]} ${reversed[1]}`));
  }
  return result;
}

const covers = fs.readdirSync(coverDirectory, { withFileTypes: true })
  .filter(entry => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()) && !/^defgame(?:\.[^.]+)?$/i.test(entry.name))
  .map(entry => ({ name: entry.name, keys: titleKeys(entry.name) }));
const roms = fs.readdirSync(romDirectory, { withFileTypes: true })
  // Deliberately inspect top-level files only. Backup directories and every
  // file beneath them are never traversed or modified.
  .filter(entry => entry.isFile() && romExtensions.has(path.extname(entry.name).toLowerCase()))
  .map(entry => entry.name);
const unmatched = roms.filter(name => {
  const keys = titleKeys(name);
  return !covers.some(cover => [...cover.keys].some(coverKey => keys.has(coverKey)));
});

const result = { totalRoms: roms.length, coverFiles: covers.length, matched: roms.length - unmatched.length, unmatched: unmatched.length, files: unmatched };
if (apply) {
  const manifest = path.join(root, `snes-roms-deleted-no-cover-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(manifest, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  for (const name of unmatched) fs.unlinkSync(path.join(romDirectory, name));
  result.manifest = manifest;
  result.deleted = unmatched.length;
}
process.stdout.write(`${JSON.stringify(result)}\n`);
