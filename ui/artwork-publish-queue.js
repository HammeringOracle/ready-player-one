const fs = require('fs');
const crypto = require('crypto');

// Persist metadata, not passwords/API keys. Resolve the machine again on each retry.
module.exports = function createArtworkQueue(file, publish) {
  let jobs = [];
  if (fs.existsSync(file)) jobs = JSON.parse(fs.readFileSync(file, 'utf8'));
  // A restart usually means RP1's publisher code or the machine connection has
  // changed. Do not preserve an old exponential-backoff delay across restarts.
  for (const job of jobs) job.nextAttempt = 0;
  // Artwork cache stays beside the project, even after the project is renamed.
  const path = require('path');
  for (const job of jobs) for (const item of job.artwork || []) {
    if (/^[a-z0-9_-]+$/i.test(job.system) && path.basename(item.fileName || '') === item.fileName) {
      item.localPath = path.join(path.dirname(file), 'scraper-cache', job.system, item.fileName);
    }
  }
  const busy = new Set();
  function save() {
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(jobs, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  }
  return {
    list: () => jobs.map(job => ({ ...job })),
    add(data) {
      const job = { ...data, id: crypto.randomUUID(), attempts: 0, nextAttempt: 0, error: '' };
      jobs.push(job);
      save();
      return job.id;
    },
    remove(id) {
      const originalLength = jobs.length;
      jobs = jobs.filter(item => item.id !== id);
      if (jobs.length !== originalLength) save();
      return jobs.length !== originalLength;
    },
    async retry(id) {
      const job = jobs.find(item => item.id === id);
      if (!job || busy.has(id)) return false;
      busy.add(id);
      try {
        await publish(job);
        jobs = jobs.filter(item => item.id !== id);
        save();
        return true;
      } catch (error) {
        job.error = error.message;
        job.attempts++;
        job.nextAttempt = Date.now() + Math.min(300000, 15000 * 2 ** Math.min(job.attempts - 1, 5));
        save();
        return false;
      } finally { busy.delete(id); }
    },
    async retryBatch(ids) {
      const idSet = new Set(ids);
      const selected = jobs.filter(item => idSet.has(item.id) && !busy.has(item.id));
      if (!selected.length) return false;
      for (const job of selected) busy.add(job.id);
      const artworkByFile = new Map();
      for (const job of selected) for (const item of job.artwork || []) {
        artworkByFile.set(item.fileName || item.localPath, item);
      }
      const combined = {
        ...selected[0],
        entries: [...new Set(selected.flatMap(job => job.entries || []))],
        artwork: [...artworkByFile.values()],
        ensurePresentation: selected.some(job => job.ensurePresentation !== false)
      };
      try {
        await publish(combined);
        jobs = jobs.filter(item => !idSet.has(item.id));
        save();
        return true;
      } catch (error) {
        const nextAttempt = Date.now() + Math.min(300000, 15000 * 2 ** Math.min(Math.max(...selected.map(job => job.attempts || 0)), 5));
        for (const job of selected) {
          job.error = error.message;
          job.attempts = Number(job.attempts || 0) + 1;
          job.nextAttempt = nextAttempt;
        }
        save();
        return false;
      } finally {
        for (const job of selected) busy.delete(job.id);
      }
    }
  };
};
