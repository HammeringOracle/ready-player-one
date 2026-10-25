(() => {
  const dialog = document.createElement('dialog');
  dialog.id = 'dualBootUndoDialog';
  dialog.className = 'ready-player-companion rp2-dialog';
  dialog.innerHTML = `
    <div class="rp2-shell">
      <header class="rp2-head modal-head"><span>Dual Boot Undo</span><button class="undo-close modal-close" type="button" aria-label="Close Dual Boot Undo">X</button></header>
      <main class="rp2-content dual-boot-undo-content">
        <section class="rp2-summary"><img class="dual-boot-undo-art" src="/ui/dual-boot-undo.png" alt=""><div><p class="rp2-eyebrow">RECOVERY PE</p><h3>Return an RP2 dual-boot PC to Windows</h3><p>This portable program reads RP2's installation journal, verifies every managed partition and boot file, then removes only the Batocera partitions and rEFInd files that RP2 recorded.</p></div></section>
        <div class="rp2-steps"><div><b>1</b><span>Create the recovery PE</span></div><div><b>2</b><span>Move it to the Windows PC</span></div><div><b>3</b><span>Run it as administrator</span></div></div>
        <div class="companion-result"><p class="undo-status companion-status" role="status" aria-live="polite"></p><button class="undo-open-downloads open-downloads-folder" type="button" aria-label="Open Downloads folder" title="Open Downloads folder"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A3.5 3.5 0 0 1 17.5 20h-11A3.5 3.5 0 0 1 3 16.5v-10Z"/></svg></button></div>
      </main>
      <footer class="rp2-actions confirm-actions"><button class="undo-cancel" type="button">Cancel</button><button class="undo-create setup" type="button"><span>Create Dual Boot Undo</span></button></footer>
    </div>`;
  document.body.append(dialog);
  const status = dialog.querySelector('.undo-status');
  const create = dialog.querySelector('.undo-create');
  const openDownloads = dialog.querySelector('.undo-open-downloads');
  let busy = false;
  const close = () => { if (!busy) dialog.close(); };
  dialog.querySelectorAll('.undo-close,.undo-cancel').forEach(button => button.onclick = close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  create.onclick = async () => {
    if (busy) return;
    busy = true; dialog.classList.add('is-busy');
    dialog.querySelectorAll('button').forEach(button => button.disabled = true);
    status.className = 'undo-status companion-status working';
    status.textContent = 'Creating Dual Boot Undo in Downloads…';
    try {
      const response = await fetch('/api/companion/download', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companion:'dual-boot-undo'})});
      const result = await response.json();
      if (!response.ok || !result.ok) throw Error(result.error || 'Could not create Dual Boot Undo.');
      status.className = 'undo-status companion-status success';
      status.textContent = `Dual Boot Undo created in Downloads.\n${result.path}`;
      openDownloads.classList.add('visible');
      create.querySelector('span').textContent = 'Recreate Dual Boot Undo';
    } catch (error) {
      status.className = 'undo-status companion-status error'; status.textContent = error.message;
    } finally {
      busy = false; dialog.classList.remove('is-busy'); dialog.querySelectorAll('button').forEach(button => button.disabled = false);
    }
  };
  openDownloads.onclick = () => fetch('/api/companion/open-downloads', {method:'POST'});
  document.querySelector('#openDualBootUndo').onclick = () => {
    document.querySelector('#advancedFeatures')?.classList.remove('open');
    document.querySelector('#advancedToggle')?.setAttribute('aria-expanded','false');
    status.className='undo-status companion-status'; status.textContent=''; openDownloads.classList.remove('visible');
    create.querySelector('span').textContent='Create Dual Boot Undo'; dialog.showModal();
  };
})();
