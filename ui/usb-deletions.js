const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function validTarget(system, name) {
  return typeof system === 'string' && /^[a-z0-9_-]+$/i.test(system) &&
    typeof name === 'string' && name.length > 0 && !/[\\\0:]/.test(name) &&
    name.split('/').every(part => part && !part.startsWith('.'));
}
function queuePath(root) { return path.join(root, 'ready-player-one', 'delete-queue.json'); }
function readQueue(root) {
  let text;
  try { text = fs.readFileSync(queuePath(root), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const data = JSON.parse(text);
  if (data.schemaVersion !== 1 || !Array.isArray(data.operations) ||
      !data.operations.every(op => op.action === 'delete' && typeof op.id === 'string' && validTarget(op.system, op.name))) {
    throw new Error('The USB deletion queue is invalid.');
  }
  return data.operations;
}
function writeQueue(root, operations) {
  const file = queuePath(root);
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const temporary = file + '.tmp';
  const fd = fs.openSync(temporary, 'w');
  try { fs.writeFileSync(fd, JSON.stringify({schemaVersion:1, operations})); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
}
function queueDeletion(root, system, name) {
  if (!validTarget(system,name)) throw new Error('Invalid USB deletion target.');
  const operations = readQueue(root);
  const existing = operations.find(op => op.system === system && op.name === name);
  if (existing) delete existing.error;
  else operations.push({id:crypto.randomUUID(), action:'delete', system, name, createdAt:new Date().toISOString()});
  writeQueue(root, operations);
}
function cancelDeletion(root, system, name) {
  const operations = readQueue(root);
  const remaining = operations.filter(op => !(op.system === system &&
    (op.name === name || op.name.startsWith(name+'/') || name.startsWith(op.name+'/'))));
  if (remaining.length !== operations.length) writeQueue(root,remaining);
}
function deletionState(root, system) {
  const operations = readQueue(root).filter(op=>op.system===system);
  const pending = operations.filter(op=>!op.error);
  return {
    pending:pending.length,
    errors:operations.filter(op=>op.error).map(op=>`${op.name}: ${op.error}`),
    hides:name=>pending.some(op=>name===op.name || name.startsWith(op.name+'/'))
  };
}
function stageController(root) {
  const directory = path.join(root,'ready-player-one');
  fs.mkdirSync(directory,{recursive:true});
  for (const name of ['usb-controller.py','usb-boot.sh']) {
    const file=path.join(directory,name);
    fs.copyFileSync(path.join(__dirname,name),file+'.tmp');
    fs.renameSync(file+'.tmp',file);
  }
  const file=path.join(root,'postshare.sh');
  let existing='';
  try { existing=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'); }
  catch (error) { if(error.code!=='ENOENT')throw error; }
  existing=existing.replace(/^# BATOCERA WAREHOUSE USB V2\n[\s\S]*?^exit 0[ \t]*\n?/m,'')
    .replace(/^# READY PLAYER ONE USB BOOT V3 BEGIN\n[\s\S]*?^# READY PLAYER ONE USB BOOT V3 END\n?/m,'');
  const lines=existing.split('\n');
  const shebang=lines[0].startsWith('#!')?lines.shift():'#!/bin/bash';
  const hook='# READY PLAYER ONE USB BOOT V3 BEGIN\nif [ "$1" = "start" ] || [ -z "$1" ]; then\n  bash /boot/ready-player-one/usb-boot.sh start\nfi\n# READY PLAYER ONE USB BOOT V3 END\n';
  fs.writeFileSync(file+'.tmp',shebang+'\n'+hook+lines.join('\n'));
  fs.renameSync(file+'.tmp',file);
}
module.exports = {queueDeletion, cancelDeletion, deletionState, readQueue, stageController};
