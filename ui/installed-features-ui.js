(() => {
  const menu = document.querySelector('#advancedMenu');
  if (!menu) return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const style = document.createElement('style');
  style.textContent = `
    .advanced-item.medicine-installed{display:flex;align-items:center;justify-content:center;gap:9px;height:auto;min-height:50px;padding:7px 10px}
    .medicine-installed-label{flex:1;min-width:0;text-align:center;line-height:1.25}
    .medicine-installed-label span{display:block;font-size:11px;font-weight:500;opacity:.85;margin-top:2px}
    .medicine-installed-star{width:23px;height:23px;flex:0 0 23px;filter:drop-shadow(0 1px 1px #39240899) drop-shadow(0 0 4px #e9ae3340)}
    .installed-feature-dialog{box-sizing:border-box;width:min(620px,94vw);max-height:90vh;overflow:auto;border:1px solid #65748b;border-radius:20px;padding:22px;background:var(--panel,#1c2028);color:var(--text,#f0f3fa)}
    .installed-feature-dialog::backdrop{background:#0009}.installed-feature-dialog header{display:flex;justify-content:space-between;align-items:center;gap:12px}
    .installed-feature-dialog h2{margin:0;font-size:24px}.installed-feature-dialog p,.installed-feature-dialog li{font-size:14px;line-height:1.55}.installed-feature-dialog ul{padding-left:22px}
    .installed-feature-dialog button{padding:9px 15px;border-radius:10px;border:1px solid #719ae5;background:#294c85;color:#fff;cursor:pointer}
    .installed-feature-dialog .installed-feature-close{position:relative;overflow:hidden;width:38px;height:32px;min-width:38px;padding:0;border:1px solid rgba(255,127,118,.9);border-radius:7px;background:linear-gradient(180deg,rgba(255,255,255,.22) 0%,rgba(181,58,53,.62) 45%,rgba(76,17,20,.94) 100%);color:transparent;font-size:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.48),inset 0 -1px 0 rgba(0,0,0,.5),0 3px 7px rgba(0,0,0,.48)}
    .installed-feature-dialog .installed-feature-close::before{content:'';position:absolute;inset:1px 3px auto;height:42%;z-index:0;border-radius:4px 4px 45% 45%;background:linear-gradient(180deg,rgba(255,255,255,.27),rgba(255,255,255,.01));pointer-events:none}
    .installed-feature-dialog .installed-feature-close::after{content:'X';position:absolute;inset:0;z-index:2;display:grid;place-items:center;color:#fff;font-family:Arial,sans-serif;font-size:19px;font-weight:1000;line-height:1;-webkit-text-stroke:.65px #5f090d;text-shadow:0 1px 1px #140102,0 0 4px rgba(255,111,101,.9);pointer-events:none}
    .installed-feature-dialog .installed-feature-close:hover{filter:brightness(1.15);box-shadow:inset 0 1px 0 rgba(255,255,255,.58),inset 0 -1px 0 rgba(0,0,0,.5),0 4px 9px rgba(0,0,0,.55)}
    .installed-feature-dialog .installed-feature-close:active{transform:translateY(1px);box-shadow:inset 0 2px 4px rgba(0,0,0,.56),0 1px 2px rgba(0,0,0,.38)}
  `;
  document.head.append(style);

  function sortAdvancedFeatures() {
    const buttons = [...menu.querySelectorAll(':scope > .advanced-item')];
    const priority = button => {
      if (button.classList.contains('medicine-installed') || ['medicine', 'rp1-medicine'].includes(button.dataset.featureId)) return 0;
      if (button.id === 'openReadyPlayerTwo') return 1;
      return 2;
    };
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
        if (['medicine', 'rp1-medicine'].includes(feature.id)) {
          button.classList.add('medicine-installed');
          button.setAttribute('aria-label', `${feature.name} (Installed)`);
          const star = side => `<svg class="medicine-installed-star" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><defs><linearGradient id="medicine-gold-${side}" x1="0" y1="0" x2=".8" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#fff4bb"/><stop offset=".38" stop-color="#ffda68"/><stop offset=".68" stop-color="#dfa62e"/><stop offset="1" stop-color="#a56b12"/></linearGradient></defs><path d="M16 2.5 20.1 11 29.5 12.3 22.7 18.9 24.3 28.3 16 23.8 7.7 28.3 9.3 18.9 2.5 12.3 11.9 11Z" fill="url(#medicine-gold-${side})" stroke="#ffdf83" stroke-width=".9" stroke-linejoin="round"/><path d="M16 4.5 16 16 4.6 12.9 12.6 11.9Z" fill="#fff8cf" opacity=".48"/><path d="M16 16 23 26.3 16 22.6 9 26.3Z" fill="#8f590b" opacity=".24"/></svg>`;
          button.innerHTML = `${star('left')}<span class="medicine-installed-label">${escapeHtml(feature.name)}<span>(Installed)</span></span>${star('right')}`;
        }
        button.onclick = () => {
          document.querySelector('#advancedFeatures')?.classList.remove('open');
          document.querySelector('#advancedToggle')?.setAttribute('aria-expanded', 'false');
          const dialog = document.createElement('dialog');
          dialog.className = 'installed-feature-dialog';
          const installed = feature.installedAt ? new Date(feature.installedAt).toLocaleString() : 'Unknown';
          const items = (feature.items || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
          dialog.innerHTML = `<header><h2>${escapeHtml(feature.name)} (Installed)</h2><button class="installed-feature-close" type="button" aria-label="Close">X</button></header><p><strong>Installed:</strong> ${escapeHtml(installed)}</p><p><strong>What was installed:</strong></p><ul>${items || '<li>Installation details were not recorded.</li>'}</ul>`;
          document.body.append(dialog);
          dialog.querySelector('button').onclick = () => dialog.close();
          dialog.addEventListener('click', event => {
            const bounds = dialog.getBoundingClientRect();
            const outside = event.clientX < bounds.left || event.clientX > bounds.right
              || event.clientY < bounds.top || event.clientY > bounds.bottom;
            if (outside) dialog.close();
          });
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
