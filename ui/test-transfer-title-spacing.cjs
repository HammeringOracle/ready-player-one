const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'Ready Player One.html'), 'utf8');

assert.match(html, /\.device-game:is\(\.artwork-stage,\.removal-pending\) > \.device-game-title\s*\{[\s\S]*?padding-right:\s*204px/u,
  'Transfer rows must reserve space between a long title and the stage label');
assert.match(html, /\.device-game:is\(\.artwork-stage,\.removal-pending\) > \.device-game-title > \.device-game-title-text\s*\{[\s\S]*?text-overflow:\s*ellipsis/u,
  'Long transfer titles must end in an ellipsis');
assert.match(html, /\.transfer-row-stage\s*\{[\s\S]*?right:\s*74px;[\s\S]*?width:\s*118px;[\s\S]*?text-overflow:\s*clip/u,
  'The complete transfer-stage wording must remain visible and shifted left');

console.log('Transfer title ellipsis and stage-spacing checks passed.');
