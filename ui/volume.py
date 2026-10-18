"""Opt-in Batocera per-application audio. Never changes sink/master volume."""
import json, os, signal, subprocess, sys, time, shutil, fcntl
from pathlib import Path

BASE = Path('/userdata/system/configs/recroom-volume')
CONFIG = BASE/'config.json'
STATE = BASE/'levels.json'
PID = Path('/var/run/recroom-volume.pid')
READY = Path('/var/run/recroom-volume.ready')
SERVICE = Path('/userdata/system/services/recroom_volume')
ACTIONS = {group+'_'+op for group in ('music','game') for op in ('up','down','mute')}

def read(path, default):
    try: return json.loads(path.read_text())
    except (OSError, ValueError): return default

def write(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value))
    temp.replace(path)

def call(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=5).stdout

def service_pid():
    try:
        pid = int(PID.read_text())
        return pid if b'recroom-volume/volume.py\x00daemon' in Path('/proc/%d/cmdline'%pid).read_bytes() else None
    except (OSError, ValueError): return None

def installed():
    return read(CONFIG, {}).get('enabled', False) and bool(service_pid()) and READY.exists()

def streams():
    return json.loads(call(['pactl','-f','json','list','sink-inputs']))

def game_process(pid):
    # Match the emulator launch ancestry, never every non-music application.
    for _ in range(16):
        try:
            proc = Path('/proc')/str(int(pid))
            cmd = proc.joinpath('cmdline').read_bytes().replace(b'\x00',b' ').decode(errors='replace')
            if 'emulatorlauncher.py' in cmd or '/configgen/' in cmd: return True
            parent = next(line.split()[1] for line in proc.joinpath('status').read_text().splitlines() if line.startswith('PPid:'))
            if parent in ('0','1'): return False
            pid = parent
        except (OSError, ValueError, StopIteration): return False
    return False

def group_of(stream, context, is_game=game_process):
    props = stream.get('properties', {})
    name = props.get('application.name','')
    binary = Path(props.get('application.process.binary','')).name.lower()
    if name == 'RecRoomMusic' or binary == 'emulationstation': return 'music'
    if not context or context == 'emulationstation': return None
    if is_game(props.get('application.process.id', '')): return 'game'
    # Some standalone launchers reparent their emulator; only accept exact names.
    aliases = {'libretro':{'retroarch'}, 'cemu':{'cemu'}, 'dolphin':{'dolphin-emu'}, 'pcsx2':{'pcsx2','pcsx2-qt'}}
    if binary in aliases.get(context, {context}): return 'game'
    return None

def current_context():
    value = read(Path('/var/run/hotkeygen.context'), {})
    # Batocera writes [] while no emulator is active on some releases.
    # Treat every non-object form as the frontend instead of crashing each
    # keypad volume action in a background process with hidden stderr.
    return value.get('name', '') if isinstance(value, dict) else ''

def apply_levels(items, levels, context):
    for item in items:
        group = group_of(item, context)
        level = levels.get(group, {})
        index = str(int(item['index']))
        if level:
            with (BASE/'originals.lock').open('a') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX)
                originals = read(BASE/'originals.json',{})
                serial = str(item.get('properties',{}).get('object.serial',index))
                if serial not in originals:
                    originals[serial]={'volume':[v['value'] for v in item.get('volume',{}).values()],'mute':item.get('mute',False)}
                    write(BASE/'originals.json',originals)
        if 'volume' in level:
            target = level['volume']
            current = [v['value']/65536*100 for v in item.get('volume',{}).values()]
            if not current or any(abs(v-target)>1 for v in current):
                call(['pactl','set-sink-input-volume',index,str(target)+'%'])
        if 'mute' in level and item.get('mute') != level['mute']:
            call(['pactl','set-sink-input-mute',index,'1' if level['mute'] else '0'])

def control(action):
    if action not in ACTIONS or not installed(): raise RuntimeError('Install Music over Games on this machine before using separate audio controls.')
    group, op = action.split('_')
    with (BASE/'levels.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        levels = read(STATE, {})
        items = streams()
        matches = [s for s in items if group_of(s,current_context()) == group]
        level = levels.setdefault(group, {})
        if op == 'mute': level['mute'] = not level.get('mute',matches[0].get('mute',False) if matches else False)
        else:
            initial = max((v['value']/65536*100 for s in matches for v in s.get('volume',{}).values()),default=100)
            level['volume'] = max(0,min(100,round(level.get('volume',initial))+(5 if op=='up' else -5)))
        write(STATE, levels)
        apply_levels(items, levels, current_context())

def daemon():
    running = True
    def finish(*_):
        nonlocal running
        running = False
    signal.signal(signal.SIGTERM,finish)
    signal.signal(signal.SIGINT,finish)
    PID.write_text(str(os.getpid()))
    player = None
    retry_at = 0
    try:
        while running:
            config = read(CONFIG,{})
            if not config.get('enabled'): break
            try:
                items = streams()
                context = current_context()
                in_game = bool(context and context != 'emulationstation')
                if player and player.poll() is not None: player = None
                if config.get('playDuringGames') and in_game and not player and time.monotonic() >= retry_at:
                    tracks = sorted(p for p in Path('/userdata/music').rglob('*') if p.is_file() and p.suffix.lower() in ('.mp3','.ogg','.flac','.wav','.m4a','.opus') and '\n' not in str(p))
                    retry_at = time.monotonic()+30
                    if tracks:
                        playlist = BASE/'playlist.m3u'
                        playlist.write_text('\n'.join(map(str,tracks))+'\n')
                        player = subprocess.Popen(['mpv','--no-config','--no-video','--ao=pulse','--audio-client-name=RecRoomMusic','--loop-playlist=inf','--shuffle','--playlist='+str(playlist)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                if player and (not in_game or not config.get('playDuringGames')):
                    player.terminate(); player.wait(timeout=4); player = None
                apply_levels(items,read(STATE,{}),context)
                write(READY,{'musicStreams':sum(group_of(s,context)=='music' for s in items),'gameStreams':sum(group_of(s,context)=='game' for s in items)})
            except Exception as error:
                write(READY,{'warning':str(error)})
            time.sleep(.4)
    finally:
        if player and player.poll() is None:
            player.terminate()
            try: player.wait(timeout=4)
            except subprocess.TimeoutExpired: player.kill(); player.wait()
        READY.unlink(missing_ok=True); PID.unlink(missing_ok=True)

def stop():
    pid = service_pid()
    if pid:
        os.kill(pid,signal.SIGTERM)
        for _ in range(60):
            if not service_pid(): return
            time.sleep(.1)
        raise RuntimeError('Music over Games service did not stop.')

def start():
    if service_pid(): return
    READY.unlink(missing_ok=True)
    subprocess.Popen([sys.executable,str(BASE/'volume.py'),'daemon'],start_new_session=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    for _ in range(50):
        if installed(): return
        time.sleep(.1)
    stop()
    raise RuntimeError('Music over Games service could not start.')

def setup(request):
    if 'Batocera' not in Path('/etc/os-release').read_text(): raise RuntimeError('Choose a Batocera machine.')
    action = request['action']
    if action == 'volume-status': return {'installed':installed(), **read(READY,{}), 'playDuringGames':read(CONFIG,{}).get('playDuringGames',False)}
    if action == 'volume-disable':
        stop()
        originals = read(BASE/'originals.json',{})
        for item in streams():
            original = originals.get(str(item.get('properties',{}).get('object.serial',item['index'])))
            if original:
                index = str(int(item['index']))
                if original['volume']: call(['pactl','set-sink-input-volume',index,*map(str,original['volume'])])
                call(['pactl','set-sink-input-mute',index,'1' if original['mute'] else '0'])
        if originals: write(BASE/'originals.json',{})
        config = read(CONFIG,{})
        if CONFIG.exists(): config['enabled']=False; write(CONFIG,config)
        if SERVICE.exists(): call(['batocera-services','disable','recroom_volume'])
        return {'installed':False}
    for command in ('pactl','batocera-services'):
        if not shutil.which(command): raise RuntimeError(command+' is required on this Batocera version.')
    streams()  # Verify JSON audio support before making any changes.
    if request.get('playDuringGames') and not shutil.which('mpv'): raise RuntimeError('mpv is required for music during games.')
    BASE.mkdir(parents=True,exist_ok=True)
    SERVICE.parent.mkdir(parents=True,exist_ok=True)
    state_path = BASE/'levels.json'
    targets = [BASE/'volume.py',CONFIG,state_path,SERVICE]
    old = {p:p.read_bytes() if p.exists() else None for p in targets}
    was_running = bool(service_pid())
    result = subprocess.run(['batocera-settings-get','system.services'],capture_output=True,text=True)
    if result.returncode and not (result.returncode==1 and not result.stdout.strip() and not result.stderr.strip()): raise RuntimeError('Could not read Batocera service settings.')
    enabled = 'recroom_volume' in result.stdout.split()
    for p,data in old.items():
        if data is not None: p.with_name(p.name+'.backup-'+str(time.time_ns())).write_bytes(data)
    try:
        stop()
        (BASE/'volume.py').write_text(request['source'])
        write(CONFIG,{'enabled':True,'playDuringGames':bool(request.get('playDuringGames'))})
        levels = read(state_path,{})
        if not isinstance(levels,dict): levels = {}
        music = levels.setdefault('music',{})
        music.setdefault('volume',50)
        music.setdefault('mute',False)
        write(state_path,levels)
        SERVICE.write_text('#!/bin/sh\nexec python3 /userdata/system/configs/recroom-volume/volume.py "$1"\n')
        SERVICE.chmod(0o755)
        start()
        call(['batocera-services','enable','recroom_volume'])
    except Exception:
        stop()
        for p,data in old.items():
            if data is None: p.unlink(missing_ok=True)
            else: p.write_bytes(data)
        call(['batocera-services','enable' if enabled else 'disable','recroom_volume'])
        if was_running: start()
        raise
    return {'installed':installed(),'playDuringGames':bool(request.get('playDuringGames'))}

if __name__ == '__main__':
    action = sys.argv[1]
    if action == 'daemon': daemon()
    elif action == 'start': start()
    elif action == 'stop': stop()
    elif action == 'status': sys.exit(0 if installed() else 1)
    elif action in ACTIONS: control(action)
    else: print(json.dumps(setup(json.loads(action))))
