const fs = require('node:fs');
const path = require('node:path');

// The boot partition is readable on Windows even when userdata is not.
// This is an inventory only; never treat its paths as filesystem write targets.
function readUsbLibrary(driveRoot) {
  try {
    const file = path.join(driveRoot, 'ready-player-one', 'library.json');
    if (fs.statSync(file).size > 128 * 1024 * 1024) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data?.schemaVersion !== 1 || !data.systems || typeof data.systems !== 'object' || Array.isArray(data.systems)) return null;
    const systems = Object.create(null);
    for (const [system, entries] of Object.entries(data.systems)) {
      if (!/^[a-z0-9_-]+$/i.test(system) || !Array.isArray(entries)) continue;
      systems[system] = entries.filter(entry => {
        if (!entry || typeof entry.name !== 'string' || !['file', 'folder'].includes(entry.kind)) return false;
        const parts = entry.name.split('/');
        return entry.name.length > 0 && !/[\\\0:]/.test(entry.name) &&
          parts.every(part => part && !part.startsWith('.')) &&
          (system === 'music' || parts.length === 1);
      });
    }
    return { ...data, systems };
  } catch {
    // Older USB readers have only bw-library.tsv; retain that fallback.
    return null;
  }
}

module.exports = { readUsbLibrary };
