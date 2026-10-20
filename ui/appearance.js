(() => {
  const key = 'recRoom.appearance.v1';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = { mode: 'dark', warm: true };
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && ['dark', 'light', 'auto'].includes(saved.mode)) preference = {mode:saved.mode, warm:saved.warm !== false};
  } catch { /* An unavailable store must never prevent app startup. */ }
  let dialog;
  let storageAvailable = true;
  function apply(save = false) {
    const resolved = preference.mode === 'auto' ? (system.matches ? 'dark' : 'light') : preference.mode;
    document.documentElement.dataset.appearance = resolved;
    document.documentElement.dataset.tone = preference.warm ? 'warm' : 'neutral';
    if (save) try { localStorage.setItem(key, JSON.stringify(preference)); storageAvailable = true; } catch { storageAvailable = false; }
    if (!dialog) return;
    dialog.querySelectorAll('[data-mode]').forEach(button => {
      const selected = button.dataset.mode === preference.mode;
      button.setAttribute('aria-pressed', String(selected));
    });
    dialog.querySelector('.appearance-switch').setAttribute('aria-checked', String(preference.warm));
    dialog.querySelector('.appearance-status').textContent = storageAvailable
      ? `Saved on this PC · ${preference.mode === 'auto' ? 'System: ' : ''}${resolved === 'dark' ? 'Dark' : 'Light'}${preference.warm ? ' · Warm' : ''}`
      : 'Applied for this session · settings could not be saved';
  }
  apply();
  system.addEventListener('change', () => { if (preference.mode === 'auto') apply(); });
  document.addEventListener('DOMContentLoaded', () => {
    const advanced = document.getElementById('advancedFeatures');
    if (!advanced) return;
    const cog = document.createElement('button');
    cog.id = 'appearanceCog'; cog.type = 'button'; cog.title = 'Settings';
    cog.setAttribute('aria-label', 'Settings'); cog.setAttribute('aria-haspopup', 'dialog');
    cog.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path stroke-linejoin="round" d="m9.5 3-.6 2.4-2 .9-2.2-.7-2.4 4.1L4 11.4v2.2l-1.7 1.7 2.4 4.1 2.2-.7 2 .9.6 2.4h5l.6-2.4 2-.9 2.2.7 2.4-4.1-1.7-1.7v-2.2l1.7-1.7-2.4-4.1-2.2.7-2-.9L14.5 3z"/><circle cx="12" cy="12.5" r="3.4"/></svg>';
    advanced.after(cog);
    dialog = document.createElement('dialog'); dialog.className = 'appearance-dialog';
    dialog.setAttribute('aria-labelledby', 'appearanceTitle');
    dialog.innerHTML = `<div class="appearance-content">
      <div class="appearance-head"><div><p class="appearance-eyebrow">MAKE ROOM FOR YOUR STYLE</p><h2 id="appearanceTitle">Appearance</h2></div><button class="appearance-close" aria-label="Close appearance settings"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <p class="appearance-description">A familiar space. A fresh perspective.</p>
      <div class="appearance-options" role="group" aria-label="Color mode">
        ${[['light','Light','Soft Aero glass'],['dark','Dark','Your classic look'],['auto','Automatic','Follows Windows']].map(([mode,label,detail]) => `<button class="appearance-option" data-mode="${mode}" aria-pressed="false"><span class="appearance-preview ${mode}" aria-hidden="true"><i></i><i></i><i></i></span><strong>${label}</strong><small>${detail}</small></button>`).join('')}
      </div>
      <div class="appearance-tone"><span class="appearance-sun" aria-hidden="true">☀</span><div class="appearance-tone-copy"><strong id="appearanceToneLabel">True Tone–style warmth</strong><p id="appearanceToneHelp">A softer, warmer tint. Manual adjustment—not ambient-light sensing.</p></div><button class="appearance-switch" role="switch" aria-checked="false" aria-labelledby="appearanceToneLabel" aria-describedby="appearanceToneHelp"></button></div>
      <button class="appearance-tour" id="openQuickTour" type="button"><span class="appearance-tour-icon" aria-hidden="true">✦</span><span><strong>Quick Tour</strong><small>Show me how Ready Player One works</small></span><span class="appearance-tour-arrow" aria-hidden="true">→</span></button>
      <div class="appearance-bottom"><span class="appearance-status" aria-live="polite"></span><button class="appearance-done">Done</button></div>
    </div>`;
    document.body.append(dialog);
    const settings = document.createElement('dialog');
    settings.className = 'appearance-dialog settings-dialog';
    settings.setAttribute('aria-labelledby', 'settingsTitle');
    settings.innerHTML = `<div class="appearance-content">
      <div class="appearance-head"><h2 id="settingsTitle">Settings</h2><button class="appearance-close" aria-label="Close settings">×</button></div>
      <p class="settings-intro">Personalize RP1 and manage every machine from one place.</p>
      <div class="settings-card-grid">
        <button class="appearance-tour" id="openAppearance" type="button"><span class="appearance-tour-icon" aria-hidden="true">◐</span><span><strong>Appearance</strong><small>Choose colors and warmth</small></span><span class="appearance-tour-arrow" aria-hidden="true">→</span></button>
        <button class="appearance-tour" id="openRemoveMachine" type="button"><span class="appearance-tour-icon remove-machine-icon" aria-hidden="true">−</span><span><strong>Remove Machine</strong><small>Remove an offline saved machine</small></span><span class="appearance-tour-arrow" aria-hidden="true">→</span></button>
      </div>
      <div class="appearance-bottom"><span></span><button class="appearance-done">Done</button></div>
    </div>`;
    const tour = dialog.querySelector('#openQuickTour');
    settings.querySelector('.settings-card-grid').append(tour);
    document.body.append(settings);
    const behavior = document.createElement('dialog');
    behavior.className = 'appearance-dialog machine-behavior-dialog';
    behavior.setAttribute('aria-labelledby','machineBehaviorTitle');
    behavior.innerHTML = `<div class="appearance-content">
      <div class="appearance-head"><h2 id="machineBehaviorTitle">Machine Behavior</h2><button class="appearance-close" aria-label="Close machine behavior">×</button></div>
      <div class="machine-behavior-layout">
        <nav class="machine-behavior-machines" aria-label="Machines"><div class="machine-behavior-loading">Loading machines…</div></nav>
        <section class="machine-behavior-panel" aria-live="polite">
          <div class="machine-behavior-empty"><span>⌁</span><strong>Select a machine</strong><small>Its supported behavior controls will appear here.</small></div>
          <form class="machine-behavior-form" hidden>
            <div class="machine-behavior-title"><div><strong class="machine-behavior-name"></strong><small class="machine-behavior-platform"></small></div><span class="machine-behavior-badge">Connected</span></div>
            <label><span>Start screensaver after<small>Choose Never to keep the interface visible.</small></span><select name="screenSaverMinutes"><option value="0">Never</option><option value="1">1 minute</option><option value="3">3 minutes</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></label>
            <label data-control="systemSleepTime"><span>Put machine to sleep after<small>Independent from the visual screensaver.</small></span><select name="systemSleepMinutes"><option value="0">Never</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></label>
            <label data-control="behavior"><span>Screensaver style<small>What appears when the interface becomes idle.</small></span><select name="behavior"><option value="dim">Dim display</option><option value="black">Black screen</option><option value="slideshow">Game slideshow</option><option value="random video">Random game video</option><option value="suspend">Suspend machine</option></select></label>
            <label data-control="powerSaver"><span>Menu power saver<small>Reduces animation work while menus are idle.</small></span><select name="powerSaver"><option value="default">Default</option><option value="enhanced">Enhanced</option><option value="instant">Instant</option><option value="disabled">Disabled</option></select></label>
            <label data-control="xboxRenderer"><span>Xbox renderer<small>Batocera setting: <code class="machine-behavior-xbox-setting">xbox.xemu_api (not set)</code></small></span><select name="xboxRenderer"><option value="AUTO">Automatic</option><option value="VULKAN">VULKAN</option><option value="OPENGL">OPENGL</option></select></label>
            <label data-control="xboxVideoMode"><span>Xbox display resolution<small>Applies to Xbox only; separate from internal rendering scale.</small></span><select name="xboxVideoMode"><option value="AUTO">Automatic</option><option value="1280x720">720p (1280×720)</option></select></label>
            <label data-control="wifiPowerSaver"><span>Wi-Fi Power Saver<small>Turn this off if Batocera's wireless connection drops while the machine is running.</small></span><select name="wifiPowerSaver"><option value="off">Off</option><option value="on">On</option></select></label>
            <p class="machine-behavior-note"></p>
            <div class="machine-behavior-actions"><button type="button" class="machine-behavior-restore">Restore Previous</button><button type="submit" class="appearance-done machine-behavior-save">Apply Settings</button></div>
          </form>
          <div class="machine-behavior-unavailable" hidden><strong>Controls unavailable</strong><p></p></div>
        </section>
      </div>
      <div class="appearance-bottom"><span class="machine-behavior-status"></span><button class="appearance-done machine-behavior-done" type="button">Done</button></div>
    </div>`;
    document.body.append(behavior);
    const behaviorMachines = behavior.querySelector('.machine-behavior-machines');
    const behaviorForm = behavior.querySelector('.machine-behavior-form');
    const behaviorEmpty = behavior.querySelector('.machine-behavior-empty');
    const behaviorUnavailable = behavior.querySelector('.machine-behavior-unavailable');
    const behaviorStatus = behavior.querySelector('.machine-behavior-status');
    const xboxRendererSelect = behaviorForm.elements.xboxRenderer;
    const xboxSetting = behaviorForm.querySelector('.machine-behavior-xbox-setting');
    const updateXboxSetting = () => {
      xboxSetting.textContent = xboxRendererSelect.value === 'AUTO'
        ? 'xbox.xemu_api (not set)'
        : `xbox.xemu_api=${xboxRendererSelect.value}`;
    };
    xboxRendererSelect.addEventListener('change', updateXboxSetting);
    let behaviorDevice = '';
    let behaviorMachinesById = {};
    let returnBehaviorToSettings = false;
    const setBehaviorBusy = busy => {
      behaviorForm.querySelectorAll('select,button').forEach(control => { control.disabled = busy; });
      behavior.classList.toggle('busy',busy);
    };
    const showBehaviorMachine = async id => {
      behaviorDevice = id;
      [...behaviorMachines.querySelectorAll('button')].forEach(button => button.setAttribute('aria-pressed',String(button.dataset.device === id)));
      behaviorStatus.textContent = 'Reading machine settings…';
      behaviorEmpty.hidden = false; behaviorForm.hidden = true; behaviorUnavailable.hidden = true;
      behaviorEmpty.querySelector('strong').textContent = 'Loading machine settings';
      behaviorEmpty.querySelector('small').textContent = 'Reading settings from the selected machine…';
      try {
        const response = await fetch(`/api/machine-behavior?device=${encodeURIComponent(id)}`,{cache:'no-store'});
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Could not read machine behavior.');
        if (!result.supported) {
          behaviorUnavailable.hidden = false;
          behaviorUnavailable.querySelector('p').textContent = result.reason || 'This platform does not expose compatible remote controls.';
          behaviorStatus.textContent = '';
          return;
        }
        const machine = behaviorMachinesById[id] || {};
        behaviorEmpty.hidden = true;
        behaviorForm.hidden = false;
        behaviorForm.querySelector('.machine-behavior-name').textContent = machine.displayName || result.displayName || id;
        behaviorForm.querySelector('.machine-behavior-platform').textContent = String(result.platform || machine.platform || 'machine').toUpperCase();
        behaviorForm.elements.screenSaverMinutes.value = String(result.screenSaverMinutes ?? 0);
        behaviorForm.elements.systemSleepMinutes.value = String(result.systemSleepMinutes ?? 0);
        behaviorForm.elements.behavior.value = result.behavior || 'dim';
        behaviorForm.elements.powerSaver.value = result.powerSaver || 'default';
        behaviorForm.elements.wifiPowerSaver.value = result.wifiPowerSaver ? 'on' : 'off';
        xboxRendererSelect.value = result.xboxRenderer || 'AUTO';
        behaviorForm.elements.xboxVideoMode.value = result.xboxVideoMode || 'AUTO';
        updateXboxSetting();
        for (const control of ['systemSleepTime','behavior','powerSaver']) behaviorForm.querySelector(`[data-control="${control}"]`).hidden = !result.capabilities?.[control];
        behaviorForm.querySelector('[data-control="xboxRenderer"]').hidden = String(result.platform || machine.platform || '').toLowerCase() !== 'batocera';
        behaviorForm.querySelector('[data-control="xboxVideoMode"]').hidden = String(result.platform || machine.platform || '').toLowerCase() !== 'batocera';
        behaviorForm.querySelector('[data-control="wifiPowerSaver"]').hidden = !result.capabilities?.wifiPowerSaver;
        behaviorForm.querySelector('.machine-behavior-note').textContent = result.kind === 'retroarch' ? 'Lakka exposes its menu screensaver timeout. System suspension remains managed by Lakka itself.' : 'Applying restarts this machine’s front end briefly so the new behavior is saved cleanly.';
        behaviorStatus.textContent = 'Ready';
      } catch (error) {
        behaviorEmpty.hidden = true;
        behaviorUnavailable.hidden = false;
        behaviorUnavailable.querySelector('p').textContent = error.message;
        behaviorStatus.textContent = 'Could not load settings';
      }
    };
    const loadBehaviorMachines = async preferredDevice => {
      // The machine context menu already identifies the target. Do not run a
      // full device discovery here; that checks every saved machine and can
      // delay this dialog several seconds before its selected-machine request.
      const card = [...document.querySelectorAll('.device-card')].find(item => item.dataset.device === preferredDevice);
      const machine = {
        displayName: card?.querySelector('.device-name')?.textContent?.trim() || preferredDevice,
        platform: card?.dataset.platform || 'batocera',
        online: Boolean(card && !card.classList.contains('offline'))
      };
      behaviorMachinesById = { [preferredDevice]: machine };
      behaviorMachines.innerHTML = '';
      behavior.querySelector('.machine-behavior-name').textContent = machine.displayName;
      behavior.querySelector('.machine-behavior-platform').textContent = machine.platform.toUpperCase();
      behaviorEmpty.hidden = false;
      behaviorEmpty.querySelector('strong').textContent = 'Loading machine settings';
      behaviorEmpty.querySelector('small').textContent = 'Reading settings from the selected machine…';
      behaviorForm.hidden = true;
      behaviorUnavailable.hidden = true;
      behaviorStatus.textContent = 'Connecting…';
      showBehaviorMachine(preferredDevice);
    };
    behaviorForm.addEventListener('submit',async event => {
      event.preventDefault(); if (!behaviorDevice) return;
      setBehaviorBusy(true); behaviorStatus.textContent = 'Applying and refreshing machine…';
      try {
        const body = {device:behaviorDevice,screenSaverMinutes:Number(behaviorForm.elements.screenSaverMinutes.value),systemSleepMinutes:Number(behaviorForm.elements.systemSleepMinutes.value),behavior:behaviorForm.elements.behavior.value,powerSaver:behaviorForm.elements.powerSaver.value,xboxRenderer:behaviorForm.elements.xboxRenderer.value,xboxVideoMode:behaviorForm.elements.xboxVideoMode.value,wifiPowerSaver:behaviorForm.elements.wifiPowerSaver.value === 'on'};
        const response = await fetch('/api/machine-behavior',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || 'Could not apply machine behavior.');
        if (!behaviorForm.querySelector('[data-control="xboxRenderer"]').hidden && result.xboxRenderer !== xboxRendererSelect.value) {
          throw new Error('Xbox renderer was not saved. Restart RP1 so its updated backend loads, then apply again.');
        }
        if (!behaviorForm.querySelector('[data-control="xboxVideoMode"]').hidden && result.xboxVideoMode !== behaviorForm.elements.xboxVideoMode.value) {
          throw new Error('Xbox display resolution was not saved. Restart RP1 so its updated backend loads, then apply again.');
        }
        behaviorStatus.textContent = result.refreshed ? 'Settings applied · interface refreshed' : 'Settings applied';
      } catch (error) { behaviorStatus.textContent = error.message; } finally { setBehaviorBusy(false); }
    });
    behaviorForm.querySelector('.machine-behavior-restore').addEventListener('click',async () => {
      if (!behaviorDevice) return; setBehaviorBusy(true); behaviorStatus.textContent = 'Restoring previous settings…';
      try {
        const response = await fetch('/api/machine-behavior',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device:behaviorDevice,restore:true})});
        const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || 'Could not restore settings.');
        behaviorStatus.textContent = 'Previous settings restored'; await showBehaviorMachine(behaviorDevice);
      } catch (error) { behaviorStatus.textContent = error.message; } finally { setBehaviorBusy(false); }
    });
    behavior.querySelectorAll('.appearance-close,.machine-behavior-done').forEach(button => button.addEventListener('click',() => behavior.close()));
    behavior.addEventListener('close',() => {
      if (!returnBehaviorToSettings) return;
      returnBehaviorToSettings = false;
      settings.showModal();
    });
    window.openMachineBehavior = device => {
      returnBehaviorToSettings = false;
      if (behavior.open) behavior.close();
      behavior.showModal();
      loadBehaviorMachines(device);
    };
    settings.querySelectorAll('.appearance-close,.appearance-done').forEach(button => button.addEventListener('click', () => settings.close()));
    tour.addEventListener('click', () => settings.close());
    settings.querySelector('#openAppearance').addEventListener('click', () => {
      settings.close(); apply(); dialog.showModal();
    });
    settings.querySelector('#openRemoveMachine').addEventListener('click', async () => {
      settings.close();
      try {
        const response = await fetch('/api/devices/removable', {cache:'no-store'});
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Could not read saved machines.');
        const approval = showXboxBiosDialog({
          title:'Remove Machine', device:'Choose machines', cancellable:true,
          confirmLabel:'Remove', cancelLabel:'Cancel',
          message:'Only machines with a red status light can be removed. Hold Ctrl while clicking to select more than one.'
        });
        const grid = document.createElement('div');
        grid.className = 'layout-machine-grid';
        xboxBiosDialogMessage.append(grid);
        const choices = [];
        for (const machine of result.machines || []) {
          const headerCard = [...document.querySelectorAll('.device-card')].find(item => item.dataset.device === machine.id);
          const removable = Boolean(machine.removable && (!headerCard || headerCard.classList.contains('offline')));
          const card = document.createElement('button');
          card.type = 'button';
          card.className = `layout-machine-card${removable ? ' offline' : ' unsupported'}`;
          card.dataset.platform = machine.platform || 'batocera';
          card.disabled = !removable;
          if (!removable) card.title = machine.searching || headerCard?.classList.contains('searching') ? 'Checking Connection' : 'Machine Is Connected';
          const icon = document.createElement('span');
          icon.className = 'mini-pc';
          icon.setAttribute('aria-hidden','true');
          const labels = document.createElement('span');
          const title = document.createElement('span');
          title.className = 'device-name';
          title.textContent = machine.displayName || machine.id;
          const meta = document.createElement('span');
          meta.className = 'device-meta';
          meta.textContent = machine.host || 'Saved machine';
          labels.append(title,meta);
          card.append(icon,labels);
          grid.append(card);
          choices.push({id:machine.id,selected:false,removable,card});
        }
        if (!choices.length) {
          const empty = document.createElement('p');
          empty.textContent = 'There are no saved machines to remove.';
          grid.append(empty);
        }
        const update = () => {
          confirmXboxBiosDialog.disabled = !choices.some(choice => choice.selected);
          choices.forEach(choice => choice.card.setAttribute('aria-pressed',String(choice.selected)));
        };
        choices.filter(choice => choice.removable).forEach(choice => {
          choice.card.addEventListener('click', event => {
            if (event.ctrlKey) choice.selected = !choice.selected;
            else {
              choices.forEach(item => { item.selected = false; });
              choice.selected = true;
            }
            update();
          });
        });
        update();
        if (!await approval) return;
        const selected = choices.filter(choice => choice.selected);
        const names = selected.map(choice => machineDisplayName(choice.id));
        const confirmed = await showXboxBiosDialog({
          title:'Confirm Removal', device:`${selected.length} offline machine${selected.length === 1 ? '' : 's'}`,
          cancellable:true, confirmLabel:'Remove', cancelLabel:'Keep',
          message:`Remove ${names.join(', ')} from Ready Player One?\n\nThis removes saved connection information only. It does not delete games from the machine.`
        });
        if (!confirmed) return;
        const removed = [];
        for (const choice of selected) {
          const removeResponse = await fetch('/api/devices/remove',{
            method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device:choice.id})
          });
          const removeResult = await removeResponse.json();
          if (!removeResponse.ok || !removeResult.ok) throw new Error(removeResult.error || `Could not remove ${choice.id}.`);
          removed.push(choice.id);
          document.querySelector(`.device-card[data-device="${CSS.escape(choice.id)}"]`)?.remove();
        }
        syncStatus.textContent = `Removed ${removed.length} saved machine${removed.length === 1 ? '' : 's'}`;
        refreshDeviceStatuses({quiet:true});
      } catch (error) {
        syncStatus.textContent = error.message;
        await showXboxBiosDialog({title:'Remove Machine',device:'Could not remove machine',message:error.message,confirmLabel:'OK'});
      }
    });
    settings.addEventListener('click', event => {
      const box = settings.getBoundingClientRect();
      if (event.target === settings && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) settings.close();
    });
    settings.addEventListener('close', () => { if (!dialog.open) cog.focus(); });
    dialog.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { preference.mode = button.dataset.mode; apply(true); }));
    dialog.querySelector('.appearance-switch').addEventListener('click', () => { preference.warm = !preference.warm; apply(true); });
    dialog.querySelectorAll('.appearance-close,.appearance-done').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', event => {
      const box = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => { settings.showModal(); settings.querySelector('#openAppearance').focus(); });
    cog.addEventListener('click', () => { advanced.classList.remove('open'); document.getElementById('advancedToggle')?.setAttribute('aria-expanded','false'); settings.showModal(); });
    apply();
  });
})();
