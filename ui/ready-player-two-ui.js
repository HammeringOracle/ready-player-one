(() => {
  const dialog = document.createElement('dialog');
  dialog.id = 'readyPlayerTwoDialog';
  dialog.className = 'ready-player-companion rp2-dialog';
  dialog.innerHTML = `
    <div class="rp2-shell">
      <header class="rp2-head modal-head">
        <span id="readyPlayerTwoTitle">Ready Player Two</span>
        <button class="companion-close modal-close" type="button" aria-label="Close Ready Player Two">X</button>
      </header>
      <main class="rp2-content">
        <section class="rp2-summary"><p class="rp2-eyebrow">WINDOWS COMPANION</p><h3>Connect a Windows game library to Ready Player One</h3><p>Run Ready Player Two on the Windows PC that stores your games. It detects supported libraries, prepares secure network sharing, and keeps that machine discoverable by RP1.</p></section>
        <section class="rp2-programs" aria-label="Supported Windows programs"><span>RetroBat</span><span>RetroArch</span><span>ES-DE</span><span>Emu-Station</span></section>
        <div class="rp2-steps"><div><b>1</b><span>Create the companion</span></div><div><b>2</b><span>Move it to the Windows gaming PC</span></div><div><b>3</b><span>Run setup there as administrator</span></div></div>
        <p class="companion-status" role="status" aria-live="polite"></p>
      </main>
      <footer class="rp2-actions confirm-actions"><button class="rp2-cancel" type="button">Cancel</button><button class="companion-create setup" type="button"><span>Create Ready Player Two</span></button></footer>
    </div>`;
  document.body.append(dialog);
  const status = dialog.querySelector('.companion-status');
  const create = dialog.querySelector('.companion-create');
  let busy = false;
  const close = () => { if (!busy) dialog.close(); };
  dialog.querySelectorAll('.companion-close, .rp2-cancel').forEach(button => { button.onclick = close; });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  create.onclick = async () => {
    busy = true;
    dialog.classList.add('is-busy');
    dialog.querySelectorAll('button').forEach(button => { button.disabled = true; });
    status.className = 'companion-status working';
    status.textContent = 'Creating Ready Player Two in Downloads…';
    try {
      const response = await fetch('/api/companion/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companion: 'two' }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw Error(result.error || 'Could not create Ready Player Two.');
      status.className = 'companion-status success';
      status.textContent = `Ready Player Two created in Downloads.\n${result.path}`;
      create.querySelector('span').textContent = 'Create Another Copy';
    } catch (error) {
      status.className = 'companion-status error';
      status.textContent = error.message;
    } finally {
      busy = false;
      dialog.classList.remove('is-busy');
      dialog.querySelectorAll('button').forEach(button => { button.disabled = false; });
    }
  };
  document.querySelector('#openReadyPlayerTwo').onclick = () => {
    document.querySelector('#advancedFeatures')?.classList.remove('open');
    document.querySelector('#advancedToggle')?.setAttribute('aria-expanded', 'false');
    status.className = 'companion-status'; status.textContent = '';
    create.querySelector('span').textContent = 'Create Ready Player Two';
    dialog.showModal();
  };
})();
