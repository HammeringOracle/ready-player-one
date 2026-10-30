const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const apply = process.argv.includes('--apply');
const systems = ['atari2600', 'atari5200', 'atari7800', 'atari800', 'atarilynx', 'xegs', 'jaguar', 'jaguarcd', 'atarist'];
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function title(name) {
  return path.basename(name, path.extname(name))
    .replace(/[_+]+/g, ' ')
    .replace(/\s*[[(].*?[\])]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function articleVariants(value) {
  const result = new Set([value]);
  const suffix = value.match(/^(.+),\s*(the|a|an)$/i);
  if (suffix) result.add(`${suffix[2]} ${suffix[1]}`);
  const prefix = value.match(/^(the|a|an)\s+(.+)$/i);
  if (prefix) result.add(`${prefix[2]}, ${prefix[1]}`);
  return [...result];
}

function key(value) {
  return String(value || '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bversus\b/g, ' vs ')
    .replace(/[^a-z0-9]+/g, '');
}

function keys(name) {
  return new Set(articleVariants(title(name)).map(key).filter(Boolean));
}

function distance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

function numericSignature(value) {
  return (value.match(/\d+/g) || []).join('|');
}

function similarity(a, b) {
  return 1 - (distance(a, b) / Math.max(a.length, b.length, 1));
}

function romPreference(file) {
  const name = file.name;
  let score = 0;
  if (/\(USA(?:[,)])/i.test(name)) score += 20;
  if (/\(World(?:[,)])/i.test(name)) score += 8;
  if (/\.(a26|a52|a78|lnx|j64|jag|rom)$/i.test(name)) score += 4;
  if (/\b(?:hack|demo|prototype|proto|beta|alpha|wip|bios|utility|trainer|conversion|homebrew)\b|\[(?:a|b|f|h|m|o|p|t|cr)\d*\]/i.test(name)) score -= 100;
  if (/\bPAL\b/i.test(name)) score -= 15;
  if (/\bPD\b/i.test(name)) score -= 8;
  return score;
}

function walkFiles(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(folder, entry.name);
    if (entry.isDirectory()) return walkFiles(absolute);
    return entry.isFile() ? [{ name: entry.name, path: absolute }] : [];
  });
}

const totals = { systems: 0, roms: 0, covers: 0, exact: 0, fuzzy: 0, renamed: 0, alreadyAligned: 0, ambiguous: 0, unmatched: 0, collisions: 0 };
const details = [];

for (const system of systems) {
  const romFolder = path.join(root, 'roms', system);
  const coverFolder = path.join(root, 'covers', system);
  // Top-level only by design: backup and deleted subfolders are never read or changed.
  const roms = fs.existsSync(romFolder)
    ? fs.readdirSync(romFolder, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => ({ name: entry.name, path: path.join(romFolder, entry.name) }))
    : [];
  const covers = walkFiles(coverFolder).filter(file => imageExtensions.has(path.extname(file.name).toLowerCase()))
    .map(file => ({ ...file, title: title(file.name), keys: keys(file.name) }));
  const exactIndex = new Map();
  for (const cover of covers) for (const coverKey of cover.keys) {
    if (!exactIndex.has(coverKey)) exactIndex.set(coverKey, []);
    exactIndex.get(coverKey).push(cover);
  }

  const proposals = [];
  for (const rom of roms) {
    const romKeys = keys(rom.name);
    const exactMatches = [...new Set([...romKeys].flatMap(romKey => exactIndex.get(romKey) || []))];
    let match = null;
    let kind = '';
    if (exactMatches.length === 1) {
      match = exactMatches[0];
      kind = 'exact';
    } else if (exactMatches.length > 1) {
      details.push({ system, status: 'ambiguous-cover', rom: rom.name, covers: exactMatches.map(item => item.name) });
      totals.ambiguous += 1;
      continue;
    } else {
      const romKey = [...romKeys].sort((a, b) => b.length - a.length)[0] || '';
      const candidates = covers.map(cover => {
        const bestKey = [...cover.keys].sort((a, b) => similarity(romKey, b) - similarity(romKey, a))[0] || '';
        return { cover, coverKey: bestKey, score: similarity(romKey, bestKey) };
      }).filter(candidate => romKey.length >= 8 && candidate.coverKey.length >= 8
        && numericSignature(romKey) === numericSignature(candidate.coverKey))
        .sort((a, b) => b.score - a.score);
      if (candidates[0]?.score >= 0.96 && (!candidates[1] || candidates[0].score - candidates[1].score >= 0.04)) {
        match = candidates[0].cover;
        kind = 'fuzzy';
      }
    }
    if (!match) {
      details.push({ system, status: 'unmatched', rom: rom.name });
      totals.unmatched += 1;
      continue;
    }
    const canonicalBase = path.basename(rom.name, path.extname(rom.name));
    const alreadyCanonical = canonicalBase.localeCompare(match.title, undefined, { sensitivity: 'accent' }) === 0;
    proposals.push({ system, rom, cover: match, kind, score: romPreference(rom) + (alreadyCanonical ? 1000 : 0) });
  }

  // One canonical ROM per cover. Never rename multiple variants to the same artwork title.
  const byCover = new Map();
  for (const proposal of proposals) {
    const coverIdentity = proposal.cover.path.toLowerCase();
    if (!byCover.has(coverIdentity)) byCover.set(coverIdentity, []);
    byCover.get(coverIdentity).push(proposal);
  }
  for (const group of byCover.values()) {
    group.sort((a, b) => b.score - a.score || a.rom.name.localeCompare(b.rom.name, undefined, { numeric: true }));
    const proposal = group[0];
    for (const duplicate of group.slice(1)) {
      details.push({ system, status: 'ambiguous-rom-variant', rom: duplicate.rom.name, cover: duplicate.cover.name });
      totals.ambiguous += 1;
    }
    const targetName = `${proposal.cover.title}${path.extname(proposal.rom.name)}`;
    const targetPath = path.join(romFolder, targetName);
    if (proposal.rom.name.localeCompare(targetName, undefined, { sensitivity: 'accent' }) === 0) {
      totals.alreadyAligned += 1;
      details.push({ system, status: 'already-aligned', rom: proposal.rom.name, cover: proposal.cover.name });
      continue;
    }
    if (fs.existsSync(targetPath)) {
      totals.collisions += 1;
      details.push({ system, status: 'collision', rom: proposal.rom.name, target: targetName, cover: proposal.cover.name });
      continue;
    }
    if (apply) fs.renameSync(proposal.rom.path, targetPath);
    totals[proposal.kind] += 1;
    if (apply) totals.renamed += 1;
    details.push({ system, status: apply ? 'renamed' : 'would-rename', kind: proposal.kind, from: proposal.rom.name, to: targetName, cover: proposal.cover.name });
  }

  totals.systems += 1;
  totals.roms += roms.length;
  totals.covers += covers.length;
}

const report = { mode: apply ? 'apply' : 'dry-run', generatedAt: new Date().toISOString(), totals, details };
const reportPath = path.join(root, 'atari-cover-alignment-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ mode: report.mode, reportPath, totals }, null, 2));
