const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('ui/server.js', 'utf8');
const start = source.indexOf('async function publishTransferredRomArtwork');
const end = source.indexOf('\nconst sftpCleanupTimer', start);
const publish = source.slice(start, end);

assert(start >= 0 && end > start, 'transfer artwork publisher exists');
assert(!/await artworkPublishQueue\.retry\(/.test(publish), 'ROM transfers never wait on individual artwork SSH publication');
assert.equal((publish.match(/wakePendingArtworkPublisher\(\)/g) || []).length, 2, 'matched and fallback artwork both wake the batch publisher');
assert.match(source, /retryBatch\(jobs\.slice\(offset, offset \+ 25\)/, 'artwork is published through the durable batch queue');
console.log('PASS: ROM completion is independent of batched artwork publication.');
