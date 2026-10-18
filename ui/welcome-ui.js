(() => {
  const storageKey = 'ready-player-one-welcome-v2';
  try { if (localStorage.getItem(storageKey) === 'dismissed') return; } catch {}

  const style = document.createElement('style');
  style.textContent = `
    #readyPlayerWelcome{box-sizing:border-box;width:min(660px,92vw);max-height:88vh;overflow:auto;border:1px solid #65748b;border-radius:22px;padding:0;background:var(--panel,#171c25);color:var(--text,#f0f3fa);box-shadow:0 24px 80px #000b}
    #readyPlayerWelcome::backdrop{background:#070a10c9}
    #readyPlayerWelcome .rpw-body{padding:28px 30px 20px}
    #readyPlayerWelcome h2{margin:0 0 10px;font-size:30px}
    #readyPlayerWelcome .rpw-intro{margin:0 0 22px;color:#b9c3d4;line-height:1.5}
    #readyPlayerWelcome .rpw-products{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    #readyPlayerWelcome article{padding:18px;border:1px solid #53627a;border-radius:16px;background:#202938}
    #readyPlayerWelcome h3{margin:0 0 8px;font-size:20px;color:#fff}
    #readyPlayerWelcome article p{margin:0;color:#ccd4e2;font-size:14px;line-height:1.55}
    #readyPlayerWelcome article:nth-child(1) h3{color:#78b8ff}
    #readyPlayerWelcome article:nth-child(2) h3{color:#86e8a8}
    #readyPlayerWelcome article:nth-child(3) h3{color:#c39cff}
    #readyPlayerWelcome footer{display:flex;justify-content:flex-end;padding:16px 30px 22px}
    #readyPlayerWelcome button{min-width:92px;padding:10px 18px;border:1px solid #81a8ef;border-radius:11px;background:#31558f;color:#fff;font-weight:700;cursor:pointer}
    @media(max-width:600px){#readyPlayerWelcome .rpw-products{grid-template-columns:1fr}#readyPlayerWelcome .rpw-body{padding:22px 20px 16px}#readyPlayerWelcome footer{padding:14px 20px 20px}}
  `;
  document.head.append(style);

  const dialog = document.createElement('dialog');
  dialog.id = 'readyPlayerWelcome';
  dialog.setAttribute('aria-labelledby', 'readyPlayerWelcomeTitle');
  dialog.innerHTML = `
    <div class="rpw-body">
      <h2 id="readyPlayerWelcomeTitle">Welcome</h2>
      <p class="rpw-intro">Ready Player One connects to and prepares supported game systems.</p>
      <div class="rpw-products">
        <article><h3>Ready Player One</h3><p>Your main game-library manager. It discovers machines, organizes games, transfers your library, and manages advanced features from one place.</p></article>
        <article><h3>Ready Player Two</h3><p>The Windows sharing companion for RetroBat, RetroArch, ES-DE, and Emu-Station, allowing Ready Player One to communicate with those libraries.</p></article>
      </div>
    </div>
    <footer><button type="button">OK</button></footer>`;
  document.body.append(dialog);

  const dismiss = () => {
    try { localStorage.setItem(storageKey, 'dismissed'); } catch {}
    dialog.close();
  };
  dialog.querySelector('button').addEventListener('click', dismiss);
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.showModal();
})();
