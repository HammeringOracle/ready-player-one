const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

if (!/checkbox\.addEventListener\("click", event => \{[\s\S]*?optimisticWarehouseSelections\.set\(selectionKey, checkbox\.checked\)[\s\S]*?scheduleWarehouseSelectionSync\(game\)/.test(html)) {
  throw new Error('Game checkboxes must capture the browser-native click state and queue exactly once.');
}
if (/pointerDesiredChecked|pointerOriginalChecked|checkbox\.addEventListener\("pointerdown"|event\.preventDefault\(\)[\s\S]{0,240}scheduleWarehouseSelectionSync\(game\)/.test(html)) {
  throw new Error('Game checkboxes must not use the old competing pointer-down/native-click toggle path.');
}
if (!/const optimisticallyChecked = optimisticWarehouseSelections\.get\(rowSelectionKey\) === true[\s\S]*?pendingTransferKeys\.has\(rowSelectionKey\)/.test(html)) {
  throw new Error('A rerendered middle-pane row must inherit the optimistic or pending check state.');
}
if (!/pendingSelectionAccepted = true;[\s\S]*?pendingSelectionKey !== null && !pendingSelectionAccepted/.test(html)) {
  throw new Error('An accepted upload must retain its pending check until backend status observes it.');
}
if (!/const observedTransferKeys = new Set\(selectedJobs[\s\S]*?observedTransferKeys\.has\(key\)[\s\S]*?pendingTransferKeys\.delete\(key\)/.test(html)) {
  throw new Error('Transfer polling must release pending click ownership only after observing the backend job.');
}
if (!/activeNames\.has\(item\[0\]\) \|\| transferIsPending\(item\[0\]\) \|\| optimisticallyChecked \? " checked"/.test(html)) {
  throw new Error('New checkbox markup must preserve a click across a background rerender.');
}
if (!/pendingTransferKeys\.has\(rowSelectionKey\)[\s\S]*?selectionSetFor\(selectedSystem\)\.has\(item\[0\]\)/.test(html)) {
  throw new Error('A rerender must restore the persisted user selection before transfer status is available.');
}
if (!/: gameCheckbox\.checked \|\| requested \|\| authoritative;/.test(html)) {
  throw new Error('Background status polling must not clear an existing user check.');
}
if (/game\.dataset\.selectionRevision !== revision \|\| !game\.isConnected/.test(html)) {
  throw new Error('Replacing a row during the next frame must not silently cancel its transfer.');
}

console.log('Immediate game checkbox regression test passed.');
