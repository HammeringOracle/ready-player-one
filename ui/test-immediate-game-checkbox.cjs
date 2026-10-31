const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'Ready Player One.html'), 'utf8');

if (!/checkbox\.addEventListener\("click", event => \{[\s\S]*?optimisticWarehouseSelections\.set\(selectionKey, checkbox\.checked\)[\s\S]*?scheduleWarehouseSelectionSync\(game\)/.test(html)) {
  throw new Error('Game checkboxes must capture the browser-native click state and queue exactly once.');
}
if (!/const activeWarehouseGameByScope = new Map\(\)/.test(html)
    || !/activeWarehouseGameByScope\.set\(pendingResetScope\(selectedDevice, selectedSystem\), game\.dataset\.name\)/.test(html)
    || !/const rowIsActive = rememberedActiveGame \? rememberedActiveGame === item\[0\] : index === 0/.test(html)) {
  throw new Error('The blue selector must remain on the most recently clicked ROM through middle-pane rerenders.');
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
if (/selectionSetFor\(selectedSystem\)\.has\(item\[0\]\)/.test(html)) {
  throw new Error('Persisted layout history must not create a checked game without a live transfer or installed file.');
}
if (!/const checked = optimisticWarehouseSelections\.has\(selectionKey\)[\s\S]*?optimisticWarehouseSelections\.get\(selectionKey\)[\s\S]*?: authoritative;/.test(html)) {
  throw new Error('Background status polling must preserve the latest optimistic user choice.');
}
if (/game\.dataset\.selectionRevision !== revision \|\| !game\.isConnected/.test(html)) {
  throw new Error('Replacing a row during the next frame must not silently cancel its transfer.');
}
if (/requestAnimationFrame\(\(\) => setTimeout\(\(\) => \{[\s\S]{0,1200}syncWarehouseSelection/.test(html)) {
  throw new Error('A checkbox enqueue must not depend on a WebView animation frame.');
}
if (!/setTimeout\(\(\) => \{[\s\S]{0,1200}syncWarehouseSelection\(game, \{ device: targetDevice, system: targetSystem \}\)/.test(html)) {
  throw new Error('A checkbox enqueue must run from the event-loop task queue.');
}
if (!/if \(!installedOnTarget\)[\s\S]*?api\/transfers\/enqueue[\s\S]*?fileNames:\[name\][\s\S]*?pendingSelectionAccepted = true/.test(html)) {
  throw new Error('Every console checkbox click must create a durable backend job before the frontend yields.');
}
if (!/const installedOnTarget = targetDevice === selectedDevice[\s\S]*?activeNames\.has\(name\)[\s\S]*?if \(!installedOnTarget\)/.test(html)) {
  throw new Error('An optimistic right-pane row must not be mistaken for an installed game.');
}
if (/const visibleInTargetPane = [\s\S]{0,300}querySelectorAll\("\.device-game"\)/.test(html)) {
  throw new Error('Transfer decisions must not use temporary right-pane DOM rows as machine inventory.');
}

console.log('Immediate game checkbox regression test passed.');
