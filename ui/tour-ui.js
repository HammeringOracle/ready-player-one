(() => {
  const storageKey = 'ready-player-one-quick-tour-v2';
  const steps = [
    {
      target: '#machineList', accent: '#76dcff', label: 'CONNECT', title: 'Your machines live here',
      description: 'Discovered machines appear as tags across the top. Choose a tag to work with that machine’s systems and games.',
      hint: 'Ready Player One searches when it opens. A green dot means the machine is connected.'
    },
    {
      target: '#openSystemPicker', accent: '#ffd56a', label: 'CHOOSE', title: 'Add your systems',
      description: 'Use the + beside Systems to choose the consoles you want to manage for the selected machine.',
      hint: 'Then choose a system in the left column to see its games. Unsupported systems are unavailable.'
    },
    {
      target: '#findMachines', accent: '#87e6ad', label: 'DISCOVER', title: 'This button is Refresh',
      description: 'The power-shaped button searches for machines again and refreshes their connection status.',
      hint: 'It does not turn a machine on, shut it down, or restart it.'
    },
    {
      target: '.panel.games', pane: true, accent: '#c5b0ff', label: 'YOUR LIBRARY', title: 'Games on this computer',
      description: 'The middle pane shows games stored on this computer for the system you selected.',
      hint: 'Choose a game’s transfer control to send it to the selected machine. The search field filters this local library.'
    },
    {
      target: '.panel.details', pane: true, accent: '#ffb086', label: 'ON YOUR MACHINE', title: 'See what’s already there',
      description: 'The right pane shows games on the selected machine for the selected system. Its heading tells you which machine you’re viewing.',
      hint: 'Switch machine tags to see another library.'
    },
    {
      target: '#advancedToggle', accent: '#ff92c2', label: 'MORE TOOLS', title: 'Advanced Features',
      description: 'Open Advanced Features for remapping, Music over Games, scrapers, network setup, and the Ready Player tools.',
      hint: 'You can replay this guide anytime from the settings cog → Quick Tour.'
    }
  ];
  const dialog = document.createElement('dialog');
  dialog.id = 'readyPlayerTour';
  dialog.setAttribute('aria-labelledby', 'rptTitle');
  dialog.setAttribute('aria-describedby', 'rptDescription');
  dialog.innerHTML = `
    <svg class="rpt-scene" aria-hidden="true" focusable="false">
      <defs><mask id="rptMask" maskUnits="userSpaceOnUse"><rect class="rpt-mask-base" fill="white"/><rect class="rpt-hole" fill="black" rx="12"/></mask></defs>
      <rect class="rpt-shade" fill="#050d1c" fill-opacity=".76" mask="url(#rptMask)"/>
      <rect class="rpt-ring-glow" rx="12"/><rect class="rpt-ring" rx="12"/>
      <path class="rpt-burst"/><path class="rpt-arrow-shadow"/><path class="rpt-arrow"/><path class="rpt-arrow-tip"/>
    </svg>
    <section class="rpt-card">
      <div class="rpt-eyebrow"><span class="rpt-label"></span><span class="rpt-count"></span></div>
      <div aria-live="polite" aria-atomic="true">
        <div class="rpt-heading"><span class="rpt-number" aria-hidden="true"></span><h2 id="rptTitle"></h2></div>
        <p class="rpt-description" id="rptDescription"></p><p class="rpt-hint"></p>
      </div>
      <div class="rpt-progress" aria-label="Tour progress">${steps.map((_, i) => `<span aria-label="Step ${i + 1}"></span>`).join('')}</div>
      <footer><button class="rpt-skip" type="button">Skip tour</button><button class="rpt-back" type="button">Back</button><button class="rpt-next" type="button" autofocus>OK <span aria-hidden="true">→</span></button></footer>
    </section>`;
  document.body.append(dialog);
  const card = dialog.querySelector('.rpt-card');
  const next = dialog.querySelector('.rpt-next');
  const back = dialog.querySelector('.rpt-back');
  const scene = dialog.querySelector('.rpt-scene');
  let index = 0, frame = 0, previousFocus, autoTimer, tracking;
  const clamp = (n, min, max) => Math.max(min, Math.min(n, Math.max(min, max)));
  const attrs = (node, values) => Object.entries(values).forEach(([name, value]) => node.setAttribute(name, value));

  function place() {
    if (!dialog.open) return;
    const target = document.querySelector(steps[index].target);
    if (!target) { finish(); return; }
    const bounds = target.getBoundingClientRect();
    const width = dialog.clientWidth, height = dialog.clientHeight;
    const box = {
      x: clamp(bounds.left - 7, 5, width - 25), y: clamp(bounds.top - 7, 5, height - 25),
      right: clamp(bounds.right + 7, 25, width - 5), bottom: clamp(bounds.bottom + 7, 25, height - 5)
    };
    let cardWidth = Math.min(408, width - 40), x, y, side = 'bottom';
    if (steps[index].pane) {
      const leftRoom = box.x - 60, rightRoom = width - box.right - 60;
      side = rightRoom > leftRoom ? 'right' : 'left';
      const room = Math.max(leftRoom, rightRoom);
      if (room >= 270) {
        cardWidth = Math.min(cardWidth, room);
        x = side === 'right' ? box.right + 40 : box.x - cardWidth - 40;
      } else {
        // On narrow/zoomed windows, spotlight the pane heading and place the card below it.
        box.bottom = Math.min(box.bottom, box.y + 74);
        side = 'bottom';
        x = (width - cardWidth) / 2;
      }
    } else {
      x = index === 2 ? box.right + 85 : box.x + 130;
    }
    card.style.width = `${cardWidth}px`;
    const cardHeight = card.offsetHeight;
    y = side === 'bottom' ? box.bottom + 105 : box.y + Math.max(85, (box.bottom - box.y - cardHeight) / 2);
    x = clamp(x, 20, width - cardWidth - 20);
    y = clamp(y, 20, height - cardHeight - 22);
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    attrs(scene, { viewBox: `0 0 ${width} ${height}` });
    attrs(dialog.querySelector('#rptMask'), { x: 0, y: 0, width, height });
    for (const node of dialog.querySelectorAll('.rpt-mask-base,.rpt-shade')) attrs(node, { x: 0, y: 0, width, height });
    for (const node of dialog.querySelectorAll('.rpt-hole,.rpt-ring,.rpt-ring-glow')) {
      attrs(node, { x: box.x, y: box.y, width: Math.max(1, box.right - box.x), height: Math.max(1, box.bottom - box.y) });
    }

    // A thick curved arrow ends at the actual highlighted control, outside the text panel.
    let start, end, control;
    if (side === 'right' || side === 'left') {
      start = { x: side === 'right' ? x + 80 : x + cardWidth - 80, y: y - 10 };
      end = { x: side === 'right' ? box.right + 9 : box.x - 9, y: box.y + 45 };
      control = { x: start.x, y: end.y - 60 };
    } else {
      start = { x: x + Math.min(95, cardWidth * .28), y: y - 10 };
      end = { x: (box.x + box.right) / 2, y: box.bottom + 9 };
      control = { x: end.x + (start.x >= end.x ? 75 : -75), y: start.y - 20 };
    }
    const path = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
    for (const node of dialog.querySelectorAll('.rpt-arrow,.rpt-arrow-shadow')) attrs(node, { d: path });
    const angle = Math.atan2(end.y - control.y, end.x - control.x), tip = 19;
    const wing = offset => `${end.x - tip * Math.cos(angle + offset)} ${end.y - tip * Math.sin(angle + offset)}`;
    attrs(dialog.querySelector('.rpt-arrow-tip'), { d: `M ${wing(-.52)} L ${end.x} ${end.y} L ${wing(.52)}` });
    const rx = box.right, by = box.bottom, lx = box.x;
    attrs(dialog.querySelector('.rpt-burst'), { d: `M ${rx + 7} ${by - 6} l 13 5 M ${rx + 2} ${by + 5} l 10 13 M ${rx - 11} ${by + 9} l 2 13 M ${lx - 6} ${box.y + 8} l -12 -5` });
  }

  function schedulePlace() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; place(); });
  }

  function render() {
    const step = steps[index];
    dialog.style.setProperty('--tour-accent', step.accent);
    dialog.querySelector('.rpt-label').textContent = step.label;
    dialog.querySelector('.rpt-count').textContent = `QUICK TOUR · ${index + 1} / ${steps.length}`;
    dialog.querySelector('.rpt-number').textContent = String(index + 1).padStart(2, '0');
    dialog.querySelector('#rptTitle').textContent = step.title;
    dialog.querySelector('#rptDescription').textContent = step.description;
    dialog.querySelector('.rpt-hint').textContent = step.hint;
    dialog.querySelectorAll('.rpt-progress span').forEach((node, i) => {
      node.dataset.passed = String(i < index);
      if (i === index) node.setAttribute('aria-current', 'step'); else node.removeAttribute('aria-current');
    });
    back.disabled = index === 0;
    next.innerHTML = index === steps.length - 1 ? 'OK <span aria-hidden="true">✓</span>' : 'OK <span aria-hidden="true">→</span>';
    card.classList.remove('rpt-enter');
    place();
    void card.offsetWidth;
    card.classList.add('rpt-enter');
    next.focus({ preventScroll: true });
  }

  function finish() {
    try { localStorage.setItem(storageKey, 'dismissed'); } catch { /* The tour still works when storage is unavailable. */ }
    dialog.close();
  }

  function hasOtherModal() {
    return !!document.querySelector('dialog[open]:not(#readyPlayerTour),.modal-backdrop.open');
  }

  function start() {
    if (dialog.open || hasOtherModal()) return;
    clearTimeout(autoTimer);
    startupObserver.disconnect();
    previousFocus = document.activeElement;
    document.querySelector('#advancedFeatures')?.classList.remove('open');
    document.querySelector('#advancedToggle')?.setAttribute('aria-expanded', 'false');
    index = 0;
    dialog.showModal();
    render();
    window.addEventListener('resize', schedulePlace);
    window.addEventListener('scroll', schedulePlace, true);
    tracking = new ResizeObserver(schedulePlace);
    for (const selector of ['.app', '.topbar', '#machineList', '.main']) {
      const element = document.querySelector(selector);
      if (element) tracking.observe(element);
    }
  }

  next.addEventListener('click', () => { if (index === steps.length - 1) finish(); else { index++; render(); } });
  back.addEventListener('click', () => { if (index > 0) { index--; render(); } });
  dialog.querySelector('.rpt-skip').addEventListener('click', finish);
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); next.click(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); back.click(); }
  });
  dialog.addEventListener('close', () => {
    tracking?.disconnect();
    window.removeEventListener('resize', schedulePlace);
    window.removeEventListener('scroll', schedulePlace, true);
    cancelAnimationFrame(frame); frame = 0;
    const canRestore = previousFocus?.isConnected && previousFocus.matches('button,a[href],input,select,textarea,[tabindex]') && previousFocus.getClientRects().length;
    const focus = canRestore ? previousFocus : document.querySelector('#advancedToggle');
    focus?.focus({ preventScroll: true });
  });
  document.addEventListener('click', event => {
    if (event.target.closest('#openQuickTour')) start();
  });

  // Let the existing one-time product introduction finish before the tour starts.
  function scheduleStartup() {
    clearTimeout(autoTimer);
    if (!hasOtherModal()) autoTimer = setTimeout(start, 350);
  }
  const startupObserver = new MutationObserver(changes => {
    if (changes.some(change => change.target.matches('dialog,.modal-backdrop'))) scheduleStartup();
  });
  let seen = false;
  try { seen = localStorage.getItem(storageKey) === 'dismissed'; } catch {}
  if (!seen) {
    startupObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'class'] });
    scheduleStartup();
  }
})();
