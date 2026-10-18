#!/usr/bin/env python3
"""Ready Player One keypad service. Only claims configured 6d7f:dcfe interfaces."""
import json, os, signal, subprocess, sys, time
from pathlib import Path

BASE = Path('/userdata/system/configs/recroom-keypad')
PID = Path('/var/run/recroom-keypad.pid')
READY = Path('/var/run/recroom-keypad.ready')

class Matcher:
    def __init__(self, mappings):
        self.mappings = mappings
        self.events = []
        self.pressed = set()
        self.codes = set()
        self.since = 0
        self.passthrough = False

    def feed(self, code, value, now):
        if not self.pressed:
            self.since = now
        if value == 1:
            self.pressed.add(code)
            self.codes.add(code)
        elif value == 0:
            self.pressed.discard(code)
        self.events.append((code, value))
        if self.passthrough:
            result = (None, self.events[:])
            self.events.clear()
        elif not self.pressed:
            action = self.mappings.get(tuple(sorted(self.codes)))
            result = (action, [] if action else self.events[:])
            self.events.clear()
        else:
            return None, []
        if not self.pressed:
            self.codes.clear()
            self.passthrough = False
        return result

    def flush_held(self, now):
        # Do not swallow a held, unrecognized shortcut indefinitely.
        if self.events and now-self.since > 2 and tuple(sorted(self.codes)) not in self.mappings:
            events, self.events = self.events, []
            self.passthrough = True
            return events
        return []


def send_action(action, keyboard):
    if action in {group+'_'+op for group in ('music','game') for op in ('up','down','mute')}:
        helper = Path('/userdata/system/configs/recroom-volume/volume.py')
        if helper.exists():
            return subprocess.Popen([sys.executable,str(helper),action],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        return None
    if action == 'escape':
        # Literal Escape, independent of hotkeygen's emulator-specific exit action.
        keyboard.write(1, 1, 1)
        keyboard.syn()
        keyboard.write(1, 1, 0)
        keyboard.syn()
        return None
    if action == 'f7':
        keyboard.write(1, 65, 1)
        keyboard.syn()
        keyboard.write(1, 65, 0)
        keyboard.syn()
        return None
    if action.startswith('key:'):
        code = getattr(__import__('evdev').ecodes, action[4:], None)
        if code is None:
            return None
        keyboard.write(1, code, 1)
        keyboard.syn()
        keyboard.write(1, code, 0)
        keyboard.syn()
        return None
    return subprocess.Popen(['hotkeygen','--send',action],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)


def open_input(evdev, path):
    # Emulator-created input nodes can disappear between enumeration and open.
    try: return evdev.InputDevice(path)
    except OSError: return None


def service_pid():
    try:
        pid = int(PID.read_text())
        command = Path('/proc/%s/cmdline' % pid).read_bytes()
        return pid if b'recroom-keypad' in command and b'daemon' in command else None
    except (OSError, ValueError):
        return None


def stop():
    pid = service_pid()
    if pid:
        os.kill(pid, signal.SIGTERM)
        for _ in range(40):
            if not service_pid():
                break
            time.sleep(.05)
        if service_pid():
            raise RuntimeError('Keypad service did not stop.')
    READY.unlink(missing_ok=True)


def daemon():
    import evdev, select
    config = json.loads((BASE/'profile.json').read_text())
    by_name = {}
    relative_by_name = {}
    for mapping in config:
        by_name.setdefault(mapping['name'], {})
        if mapping.get('eventType')=='rel':
            relative_by_name.setdefault(mapping['name'],{})[(mapping['codes'][0],mapping['direction'])]=mapping['action']
        else:
            by_name[mapping['name']][tuple(sorted(mapping['codes']))] = mapping['action']
    abs_mappings={(m['name'],m['codes'][0],m.get('direction')):m['action'] for m in config if m.get('eventType')=='abs'}
    abs_states={}
    running = True
    def finish(*_):
        nonlocal running
        running = False
    signal.signal(signal.SIGTERM, finish)
    signal.signal(signal.SIGINT, finish)
    PID.write_text(str(os.getpid()))
    inputs = {}
    children = []
    synthetic_codes = {evdev.ecodes.KEY_ESC, evdev.ecodes.KEY_F7}
    for mapping in config:
        if mapping['action'].startswith('key:'):
            code = getattr(evdev.ecodes, mapping['action'][4:], None)
            if code is not None: synthetic_codes.add(code)
    keyboard = evdev.UInput({evdev.ecodes.EV_KEY:sorted(synthetic_codes)}, name='Ready Player One Hotkeys', phys='recroom-keypad-hotkeys')
    def release(entry):
        device, output, matcher = entry
        try: device.ungrab()
        except OSError: pass
        output.close()
        device.close()
    try:
        next_scan = 0
        while running:
            if time.monotonic() >= next_scan:
                next_scan = time.monotonic()+1
                for path in evdev.list_devices():
                    if path in inputs: continue
                    device = open_input(evdev, path)
                    if device is None: continue
                    if (device.info.vendor,device.info.product)!=(0x6d7f,0xdcfe) or (device.phys or '').startswith('recroom-keypad') or device.name not in by_name:
                        device.close(); continue
                    output = evdev.UInput.from_device(device, name=device.name, phys='recroom-keypad', vendor=device.info.vendor, product=device.info.product)
                    try: device.grab()
                    except Exception:
                        output.close(); device.close(); raise
                    inputs[path] = (device,output,Matcher(by_name[device.name]))
                READY.write_text(json.dumps({'interfaces':len(inputs)}))
            ready,_,_ = select.select([entry[0] for entry in inputs.values()],[],[],.1)
            for device in ready:
                entry = inputs[device.path]
                output,matcher = entry[1:]
                try:
                    for event in device.read():
                        if BASE.name == 'recroom-ps4' and event.type == evdev.ecodes.EV_KEY:
                            action=by_name.get(device.name,{}).get((event.code,))
                            if not action:
                                output.write_event(event); output.syn()
                            elif action.startswith('key:'):
                                code=getattr(evdev.ecodes,action[4:],None)
                                if code is not None: keyboard.write(1,code,event.value); keyboard.syn()
                            elif event.value==1:
                                child=send_action(action,keyboard)
                                if child is not None: children.append(child)
                        elif event.type == evdev.ecodes.EV_ABS and event.code in (16,17):
                            axis=(device.path,event.code)
                            previous=abs_states.get(axis,0)
                            current=event.value
                            abs_states[axis]=current
                            if previous != current:
                                previous_action=abs_mappings.get((device.name,event.code,previous))
                                action=abs_mappings.get((device.name,event.code,current))
                                if previous_action and previous_action.startswith('key:'):
                                    keyboard.write(1,getattr(evdev.ecodes,previous_action[4:]),0); keyboard.syn()
                                if action:
                                    if action.startswith('key:'):
                                        keyboard.write(1,getattr(evdev.ecodes,action[4:]),1); keyboard.syn()
                                    else:
                                        child=send_action(action,keyboard)
                                        if child is not None: children.append(child)
                                output.write(event.type,event.code,0 if action else current); output.syn()
                        elif event.type == evdev.ecodes.EV_KEY:
                            action, events = matcher.feed(event.code,event.value,time.monotonic())
                            for code,value in events: output.write(evdev.ecodes.EV_KEY,code,value)
                            if events: output.syn()
                            if action:
                                child = send_action(action, keyboard)
                                if child is not None: children.append(child)
                        elif event.type == evdev.ecodes.EV_REL and event.code in (6,8,11,12):
                            axis={11:8,12:6}.get(event.code,event.code)
                            action=relative_by_name.get(device.name,{}).get((axis,1 if event.value>0 else -1))
                            if action:
                                # High-resolution companions are consumed, not fired a second time.
                                if event.code in (6,8) and event.value:
                                    for _ in range(min(abs(event.value),8)):
                                        child = send_action(action, keyboard)
                                        if child is not None: children.append(child)
                            else:
                                output.write_event(event); output.syn()
                        elif event.type not in (evdev.ecodes.EV_SYN,evdev.ecodes.EV_MSC):
                            output.write_event(event); output.syn()
                except OSError:
                    release(entry); del inputs[device.path]
            for device,output,matcher in inputs.values():
                for code,value in matcher.flush_held(time.monotonic()): output.write(evdev.ecodes.EV_KEY,code,value)
                output.syn()
            children = [child for child in children if child.poll() is None]
    finally:
        keyboard.close()
        for entry in inputs.values(): release(entry)
        READY.unlink(missing_ok=True)
        PID.unlink(missing_ok=True)


if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv)>1 else 'status'
    if action == 'daemon': daemon()
    elif action == 'stop': stop()
    elif action == 'status': sys.exit(0 if service_pid() else 1)
    elif action == 'start':
        if not service_pid():
            READY.unlink(missing_ok=True)
            with (BASE/'service.log').open('ab') as log:
                child = subprocess.Popen([sys.executable,str(BASE/'bridge.py'),'daemon'],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
            for _ in range(60):
                if READY.exists(): break
                if child.poll() is not None: raise RuntimeError('Keypad service failed; see '+str(BASE/'service.log'))
                time.sleep(.05)
            else:
                stop(); raise RuntimeError('Keypad service did not become ready.')
    else: raise RuntimeError('Unknown service action')
