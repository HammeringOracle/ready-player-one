import base64, json, os, re, select, sys, time, subprocess, zlib, signal
from pathlib import Path
import evdev

request = json.loads(sys.argv[1])
if request.get('action') == 'apply' and any(m.get('action') in {g+'_'+op for g in ('music','game') for op in ('up','down','mute')} for m in request.get('mappings',[])):
    volume_helper = Path('/userdata/system/configs/recroom-volume/volume.py')
    if not volume_helper.exists() or subprocess.run([sys.executable,str(volume_helper),'status'],capture_output=True,timeout=5).returncode:
        raise Exception('Install Music over Games on this machine before applying Music or Game volume functions. Standard volume controls do not need it.')
os_release = Path('/etc/os-release').read_text()
if not (re.search(r'^ID=["\']?batocera["\']?\s*$', os_release, re.M) or re.search(r'^NAME=["\']?Batocera\.linux["\']?\s*$', os_release, re.M)):
    raise Exception('This feature supports Batocera only.')
if request['action'] == 'load':
    profile_path = Path('/userdata/system/configs/recroom-keypad/profile.json')
    print(json.dumps({'mappings':json.loads(profile_path.read_text()) if profile_path.exists() else []}))
    sys.exit(0)
if request['action'] == 'discover':
    candidates=[]
    try:
        for input_path in evdev.list_devices():
            candidate=evdev.InputDevice(input_path)
            if evdev.ecodes.EV_KEY in candidate.capabilities() and candidate.info.vendor and not (candidate.phys or '').startswith('recroom-keypad'):
                candidates.append(candidate)
            else: candidate.close()
        deadline=time.monotonic()+12
        found=None
        while candidates and time.monotonic()<deadline and found is None:
            readable,_,_=select.select(candidates,[],[],.1)
            for candidate in readable:
                for event in candidate.read():
                    if event.type==evdev.ecodes.EV_KEY and event.value==1:
                        found={'id':f'{candidate.info.vendor:04x}:{candidate.info.product:04x}','vendor':candidate.info.vendor,'product':candidate.info.product,'name':candidate.name}
                        break
                if found: break
        print(json.dumps(found or {'waiting':True}))
    finally:
        for candidate in candidates: candidate.close()
    sys.exit(0)
if not Path('/var/run/hotkeygen.pid').exists():
    raise Exception('Batocera hotkeygen must be running. This Batocera version may not support global keypad hotkeys.')
devices = []
for path in evdev.list_devices():
    device = evdev.InputDevice(path)
    matches = (device.info.vendor == 0x054c and device.info.product in (0x05c4,0x09cc,0x0ba0)) if request.get('deviceType') == 'ps4' else (device.info.vendor, device.info.product) == (0x6d7f, 0xdcfe)
    if matches and not (device.phys or '').startswith('recroom-keypad') and any(kind in device.capabilities() for kind in (1,2)):
        devices.append(device)
    else:
        device.close()
if not devices:
    raise Exception('Connect the selected PS4 Controller to this machine first.' if request.get('deviceType') == 'ps4' else 'Connect the 9 Mechanical/2 Vol keypad (6d7f:dcfe) to this machine first.')
action = request['action']
base = Path('/userdata/system/configs/recroom-keypad')
service = Path('/userdata/system/services/recroom_keypad')
if action == 'learn':
    def cancel_capture(*_): raise InterruptedError('Button detection cancelled.')
    signal.signal(signal.SIGTERM,cancel_capture)
    grabbed = []
    restart = service.exists() and subprocess.run([str(service),'status'],capture_output=True).returncode == 0
    try:
        if restart:
            subprocess.run([str(service),'stop'],check=True,capture_output=True,timeout=5)
        for device in devices:
            device.grab()
            grabbed.append(device)
        deadline = time.monotonic() + 12
        codes, pressed = set(), set()
        name = None
        completed = None
        relative = None
        absolute = None
        while time.monotonic() < deadline:
            ready, _, _ = select.select(devices, [], [], .1)
            for device in ready:
                for event in device.read():
                    if request.get('deviceType') == 'ps4' and event.type == evdev.ecodes.EV_ABS and event.code in (16,17) and event.value:
                        absolute=(device.name,event.code,1 if event.value>0 else -1)
                        completed=time.monotonic()
                        continue
                    if event.type == 2 and event.code in (6,8) and event.value:
                        signal = (device.name,event.code,1 if event.value>0 else -1)
                        if codes or (relative and relative!=signal): raise Exception('Move only one knob in one direction for this assignment.')
                        relative=signal;completed=time.monotonic()
                        continue
                    if event.type != evdev.ecodes.EV_KEY: continue
                    if event.value == 1:
                        if relative: raise Exception('Turn or press the knob separately, not both together.')
                        if name is not None and device.name != name:
                            raise Exception('Press only one mechanical button at a time.')
                        name = device.name
                        codes.add(event.code)
                        pressed.add(event.code)
                        completed = None
                    elif event.value == 0:
                        pressed.discard(event.code)
                        if codes and not pressed: completed = time.monotonic()
            if completed is not None and time.monotonic()-completed > .25: break
        if pressed:
            raise Exception('Release the mechanical button and try again; capture needs the complete press and release.')
        if absolute:
            name,code,direction=absolute
            print(json.dumps({'name':name,'codes':[code],'eventType':'abs','direction':direction,'key':('D-pad horizontal' if code==16 else 'D-pad vertical')+(' +' if direction>0 else ' -')}))
        elif relative:
            name,code,direction=relative
            print(json.dumps({'name':name,'codes':[code],'eventType':'rel','direction':direction,'key':('REL_WHEEL' if code==8 else 'REL_HWHEEL')+(' +' if direction>0 else ' -')}))
        elif not codes:
            print(json.dumps({'waiting':True}))
        else:
            names = []
            for code in sorted(codes):
                key = evdev.ecodes.bytype[evdev.ecodes.EV_KEY].get(code)
                if isinstance(key,(tuple,list)):
                    key = next((n for n in key if n.startswith(('KEY_','BTN_'))),None)
                if not isinstance(key,str): raise Exception('Unknown input code: '+str(code))
                names.append(key)
            print(json.dumps({'name':name,'codes':sorted(codes),'key':' + '.join(names)}))
    finally:
        for device in grabbed: device.ungrab()
        if restart:
            subprocess.run([str(service),'start'],check=True,capture_output=True,timeout=5)
elif action == 'apply':
    for profile in request['mappings']:
        device = next((d for d in devices if d.name == profile['name']), None)
        event_type = 3 if profile.get('eventType')=='abs' else 2 if profile.get('eventType')=='rel' else evdev.ecodes.EV_KEY
        if device is None or not set(profile['codes']).issubset(device.capabilities(absinfo=False).get(event_type,[])):
            raise Exception('This keypad does not match the learned shortcut. Identify it on this machine first.')
    if not Path('/usr/bin/batocera-services').exists():
        raise Exception('This Batocera version does not support the keypad service.')
    base.mkdir(parents=True,exist_ok=True)
    service.parent.mkdir(parents=True,exist_ok=True)
    targets = {
        base/'bridge.py':zlib.decompress(base64.b64decode(request['bridge'])),
        base/'profile.json':(json.dumps(request['mappings'],indent=2)+'\n').encode(),
        service:('#!/bin/sh\nexec python3 /userdata/system/configs/recroom-keypad/bridge.py "$1"\n').encode()
    }
    # Keep other previously installed keypad shortcuts when applying a partial layout.
    profile_path = base/'profile.json'
    if profile_path.exists() and not request.get('replaceLayout'):
        previous = json.loads(profile_path.read_text())
        def signature(m): return (m['name'],m.get('eventType','key'),tuple(m['codes']),m.get('direction',0))
        incoming = {signature(m) for m in request['mappings']}
        combined = [m for m in previous if signature(m) not in incoming] + request['mappings']
        targets[profile_path] = (json.dumps(combined,indent=2)+'\n').encode()
    old = {p:p.read_bytes() if p.exists() else None for p in targets}
    was_running = service.exists() and subprocess.run([str(service),'status'],capture_output=True).returncode == 0
    services_result = subprocess.run(['batocera-settings-get','system.services'],capture_output=True,text=True)
    # Batocera returns 1 with no output when no services have been enabled yet.
    if services_result.returncode != 0 and not (services_result.returncode == 1 and not services_result.stdout.strip() and not services_result.stderr.strip()):
        raise Exception('Could not read enabled services: '+(services_result.stderr.strip() or str(services_result.returncode)))
    enabled = services_result.stdout.split()
    backups = []
    for p,data in old.items():
        if data is not None:
            backup = str(p)+'.backup-'+str(time.time_ns())
            Path(backup).write_bytes(data);backups.append(backup)
    try:
        if was_running: subprocess.run([str(service),'stop'],check=True,capture_output=True,timeout=5)
        for p,data in targets.items():
            temp = p.with_name(p.name+'.tmp')
            temp.write_bytes(data);temp.replace(p)
        service.chmod(0o755)
        if json.loads(targets[profile_path]):
            subprocess.run([str(service),'start'],check=True,capture_output=True,timeout=8)
            state = json.loads(Path('/var/run/recroom-keypad.ready').read_text())
            if state['interfaces'] < 1: raise Exception('Keypad service could not claim the connected keypad.')
            subprocess.run(['batocera-services','enable','recroom_keypad'],check=True,capture_output=True,timeout=5)
        else:
            subprocess.run(['batocera-services','disable','recroom_keypad'],check=True,capture_output=True,timeout=5)
        for p,data in targets.items():
            if p.read_bytes()!=data: raise Exception('Keypad configuration verification failed.')
    except Exception:
        if service.exists(): subprocess.run([str(service),'stop'],capture_output=True,timeout=5)
        for p,data in old.items():
            if data is None: p.unlink(missing_ok=True)
            else: p.write_bytes(data)
        if 'recroom_keypad' not in enabled:
            subprocess.run(['batocera-services','disable','recroom_keypad'],capture_output=True,timeout=5)
        else:
            subprocess.run(['batocera-services','enable','recroom_keypad'],capture_output=True,timeout=5)
        if was_running: subprocess.run([str(service),'start'],capture_output=True,timeout=5)
        raise
    print(json.dumps({'installed':True,'paths':[str(p) for p in targets],'backups':backups}))
else:
    raise Exception('Unknown keypad action.')
