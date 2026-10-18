const fs = require("node:fs");
const path = require("node:path");
const { parentPort, workerData } = require("node:worker_threads");

function directorySize(folder) {
  let total = 0;
  const stack = [folder];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) {
        try { total += Number(fs.statSync(absolute).size); } catch {}
      }
    }
  }
  return total;
}

const sizes = {};
const trackSizes = {};
for (const item of workerData.items || []) {
  const absolute = path.join(workerData.folderPath, item.name);
  if (workerData.system === "music" && item.kind === "folder") {
    let total = 0;
    const perTrack = {};
    for (const track of item.tracks || []) {
      try {
        const bytes = Number(fs.statSync(path.join(absolute, track)).size);
        perTrack[track] = bytes;
        total += bytes;
      } catch {}
    }
    sizes[item.name] = total;
    trackSizes[item.name] = perTrack;
    continue;
  }
  try {
    const stats = fs.statSync(absolute);
    let size = stats.isDirectory() ? directorySize(absolute) : Number(stats.size);
    if (workerData.system === "ps1" && path.extname(item.name).toLowerCase() === ".cue" && stats.isFile()) {
      const references = [...fs.readFileSync(absolute, "utf8").matchAll(/^\s*FILE\s+(?:"([^"]+)"|(\S+))/gim)]
        .map(match => match[1] || match[2]).filter(Boolean);
      for (const reference of new Set(references)) {
        const companion = path.resolve(path.dirname(absolute), reference.replace(/\\/g, path.sep));
        const relative = path.relative(workerData.folderPath, companion);
        if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
        try { size += Number(fs.statSync(companion).size); } catch {}
      }
    }
    sizes[item.name] = size;
  } catch {}
}

parentPort.postMessage({ sizes, trackSizes });
