const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const createQueue = require('./artwork-publish-queue');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp1-artwork-queue-'));
  const file = path.join(dir, 'pending.json');
  fs.writeFileSync(file, '{partial');
  const recovered = createQueue(file, async () => {});
  assert.deepEqual(recovered.list(), [], 'a damaged queue must not stop startup');
  assert(fs.readdirSync(dir).some(name => name.startsWith('pending.json.corrupt-')), 'the damaged queue must be retained for diagnosis');
  assert.throws(() => recovered.add({deviceName:'Batocera',system:'xbox360',entries:[],artwork:[]}), /incomplete/);

  let fail = true;
  let refreshes = 0;
  const queue = createQueue(file, async () => {
    if (fail) throw new Error('temporary connection failure');
  }, async job => {
    refreshes += 1;
    assert.equal(job.system, 'xbox360');
  });
  const id = queue.add({deviceName:'Batocera',system:'xbox360',transferFileName:'Tekken 6.iso',entries:['<game/>'],artwork:[]});
  assert.equal(await queue.retry(id), false);
  assert.equal(queue.list().length, 1, 'failed publication must stay durable');
  fail = false;
  assert.equal(await queue.retryBatch([id]), true);
  assert.equal(queue.list().length, 0, 'successful recovery must clear the durable job');
  assert.equal(refreshes, 1, 'delayed publication must refresh Batocera exactly once');
  console.log('PASS: damaged and interrupted artwork queues recover safely');
})().catch(error => { console.error(error); process.exitCode = 1; });
