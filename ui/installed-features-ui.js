(() => {
  const menu = document.querySelector('#advancedMenu');
  if (!menu) return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const style = document.createElement('style');
  style.textContent = `
    .installed-feature-dialog{box-sizing:border-box;width:min(620px,94vw);max-height:90vh;overflow:auto;border:1px solid #65748b;border-radius:20px;padding:22px;background:var(--panel,#1c2028);color:var(--text,#f0f3fa)}
    .installed-feature-dialog::backdrop{background:#0009}.installed-feature-dialog header{display:flex;justify-content:space-between;align-items:center;gap:12px}
    .installed-feature-dialog h2{margin:0;font-size:24px}.installed-feature-dialog p,.installed-feature-dialog li{font-size:14px;line-height:1.55}.installed-feature-dialog ul{padding-left:22px}
    .installed-feature-dialog button{padding:9px 15px;border-radius:10px;border:1px solid #719ae5;background:#294c85;color:#fff;cursor:pointer}
  `;
  document.head.append(style);

  function sortAdvancedFeatures() {
    const buttons = [...menu.querySelectorAll(':scope > .advanced-item')];
    const priority = button => button.id === 'openReadyPlayerTwo' ? 0 : 1;
    buttons.sort((left, right) => priority(left) - priority(right)
      || left.textContent.trim().localeCompare(right.textContent.trim(), undefined, { sensitivity: 'base' }));
    menu.append(...buttons);
  }

  async function load() {
    try {
      const response = await fetch('/api/installed-features', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.ok) return;
      for (const feature of result.features || []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'advanced-item installed-feature-item';
        button.dataset.featureId = feature.id || '';
        button.textContent = `${feature.name} (Installed)`;
        button.onclick = () => {
          document.querySelector('#advancedFeatures')?.classList.remove('open');
          document.querySelector('#advancedToggle')?.setAttribute('aria-expanded', 'false');
          const dialog = document.createElement('dialog');
          dialog.className = 'installed-feature-dialog';
          const installed = feature.installedAt ? new Date(feature.installedAt).toLocaleString() : 'Unknown';
          const items = (feature.items || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
          dialog.innerHTML = `<header><h2>${escapeHtml(feature.name)} (Installed)</h2><button type="button" aria-label="Close">×</button></header><p><strong>Installed:</strong> ${escapeHtml(installed)}</p><p><strong>What was installed:</strong></p><ul>${items || '<li>Installation details were not recorded.</li>'}</ul>`;
          document.body.append(dialog);
          dialog.querySelector('button').onclick = () => dialog.close();
          dialog.addEventListener('close', () => dialog.remove(), { once: true });
          dialog.showModal();
        };
        menu.append(button);
      }
      sortAdvancedFeatures();
    } catch {}
  }
  load();
})();
