const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const dispatcher = source.slice(source.indexOf('async function dispatchPersistedTransferQueue()'), source.indexOf('\nserver.listen(port,'));
async function check({active = 0, small = false, missing = false}) {
  const size = small ? 1024 : 100 * 1024 * 1024;
  const jobs = Array.from({length: 559}, (_, index) => ({
    device: 'test', system: 'gamecube', fileName: String(index).padStart(4, '0'),
    running: index < active, totalBytes: index < active ? size : 0,
    autoQueued: true, queuedAt: '2026-01-01', queueOrder: index
  }));
  const probes = [], timers = [];
  const context = vm.createContext({
    backendStartedAt: 0, queuedTransferDispatchRunning: false,
    transferJobs: new Map(jobs.map(job => [job.fileName, job])),
    readDeviceSettings: () => ({}), devices: {}, verifiedInstallationIds: new Map(),
    activeQueuedTransferSystem: new Map(),
    displayGameTitle: (system, name) => name,
    compareNaturalGameTitles: (a, b) => a.localeCompare(b),
    localTransferSize: (system, name) => {
      probes.push(name);
      if (missing && name === '0000') throw new Error('Missing source');
      return {totalBytes: size};
    },
    fs: {existsSync: () => { throw new Error('Eager queue filesystem scan'); }},
    safeLocalRomPath: () => { throw new Error('Eager queue path validation'); },
    scheduleTransferPersistence: () => {}, setTimeout: callback => timers.push(callback)
  });
  await vm.runInContext(dispatcher + '\ndispatchPersistedTransferQueue()', context);
  return {jobs, probes, timers};
}
(async () => {
  let result = await check({active: 4});
  assert.equal(result.probes.length, 0, 'A full large-file pool must not touch waiting files');
  assert.equal(result.timers.length, 0);
  result = await check({active: 3});
  assert.deepEqual(result.probes, ['0003']);
  assert.equal(result.timers.length, 1);
  result = await check({});
  assert.equal(result.probes.length, 4);
  assert.deepEqual(result.jobs.filter(j => j.dispatching).map(j => j.fileName), ['0000','0001','0002','0003']);
  result = await check({small: true});
  assert.equal(result.probes.length, 10);
  assert.equal(result.timers.length, 10);
  result = await check({small: true, active: 10});
  assert.equal(result.probes.length, 0);
  result = await check({missing: true});
  assert.equal(result.jobs[0].autoQueued, false);
  assert.equal(result.jobs[0].queuedAt, '');
  assert.equal(result.timers.length, 4, 'A missing source must not block later titles');
  console.log('PASS: 559-title queue checks only available slots, preserves 4/10 and order, and handles missing sources.');
})().catch(error => {console.error(error); process.exitCode = 1;});
