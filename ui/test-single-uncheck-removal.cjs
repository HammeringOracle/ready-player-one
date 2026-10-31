const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');
const helper = html.slice(html.indexOf('    async function requestRomRemoval('), html.indexOf('    async function removeFromSelectedDevice('));
async function run(responses) {
  const requests = [];
  const context = vm.createContext({apiBase: '', setTimeout: callback => callback(),
    fetch: async (url, options) => {
      requests.push(JSON.parse(options.body));
      const result = responses.shift();
      if (!result) throw new Error('Unexpected extra request');
      return {status: result.status, ok: result.status === 200, json: async () => result.body};
    }
  });
  const promise = vm.runInContext(helper + '\nrequestRomRemoval("machine", "gamecube", "game.rvz")', context);
  return {promise, requests};
}
(async () => {
  const success = {status: 200, body: {ok: true}};
  let test = await run([{status:409, body:{ok:false,code:'TRANSFER_STOPPING'}}, success]);
  await test.promise;
  assert.equal(test.requests.length, 2);
  assert.deepEqual(test.requests[0], test.requests[1], 'Retry must retain the clicked machine, console and game');
  test = await run([{status:409, body:{ok:false,error:'game is still closing its transfer. Try unchecking it again in a moment.'}},success]);
  await test.promise;
  test = await run([{status:500,body:{ok:false,error:'Disk failure'}}]);
  await assert.rejects(test.promise, /Disk failure/);
  assert.equal(test.requests.length, 1, 'Real failures must not be silently retried');
  const handler = html.slice(html.indexOf('    function bindActiveRemoves()'));
  assert.ok(handler.indexOf('optimisticActiveRemovals.add(clickedRemovalKey)') < handler.indexOf('row.classList.contains("transfer-queued")'));
  console.log('PASS: one uncheck waits for transfer shutdown; failures remain visible and scope stays fixed.');
})().catch(error => {console.error(error);process.exitCode=1;});
