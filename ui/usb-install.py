"""Install/upgrade USB Controller over SSH without replacing unrelated hooks."""
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

BOOT_HOOK = '''# READY PLAYER ONE USB BOOT V3 BEGIN
if [ "$1" = "start" ] || [ -z "$1" ]; then
  bash /boot/ready-player-one/usb-boot.sh start
fi
# READY PLAYER ONE USB BOOT V3 END
'''
CUSTOM_HOOK = '''# READY PLAYER ONE USB CONTROLLER
if [ "$1" = "start" ] || [ -z "$1" ]; then
  nohup python3 /userdata/system/ready-player-one/usb-controller.py >/dev/null 2>&1 &
fi
'''

def boot_hook(existing):
    existing = existing.replace('\r\n','\n')
    existing = re.sub(r'(?ms)^# BATOCERA WAREHOUSE USB V2\n.*?^exit 0[ \t]*\n?', '', existing)
    existing = re.sub(r'(?ms)^# READY PLAYER ONE USB BOOT V3 BEGIN\n.*?^# READY PLAYER ONE USB BOOT V3 END\n?', '', existing)
    return prepend(existing, BOOT_HOOK)

def prepend(existing, hook):
    lines = existing.splitlines(keepends=True)
    shebang = lines.pop(0).rstrip() if lines and lines[0].startswith('#!') else '#!/bin/bash'
    return shebang+'\n'+hook+''.join(lines)

def write_text(file, text):
    file.parent.mkdir(parents=True, exist_ok=True)
    temp = file.with_name(file.name+'.rpo-tmp')
    with temp.open('w',encoding='utf-8',newline='\n') as stream:
        stream.write(text)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp,file)

def main():
    import fcntl
    source = Path(sys.argv[1]).read_text(encoding='utf-8')
    boot = Path(sys.argv[2]).read_text(encoding='utf-8')
    compile(source,'usb-controller.py','exec')
    state = Path('/userdata/system/ready-player-one')
    state.mkdir(parents=True,exist_ok=True)
    with (state/'usb-install.lock').open('w') as installation:
        fcntl.flock(installation,fcntl.LOCK_EX|fcntl.LOCK_NB)
        script = state/'usb-controller.py'
        readonly = any(line.split()[1]=='/boot' and 'ro' in line.split()[3].split(',')
                       for line in Path('/proc/mounts').read_text().splitlines())
        try:
            if readonly:
                subprocess.run(['mount','-o','remount,rw','/boot'],check=True,capture_output=True)
            write_text(Path('/boot/ready-player-one/usb-controller.py'),source)
            write_text(Path('/boot/ready-player-one/usb-boot.sh'),boot)
            postshare=Path('/boot/postshare.sh')
            write_text(postshare,boot_hook(postshare.read_text() if postshare.exists() else ''))
            write_text(script,source)
            custom=Path('/userdata/system/custom.sh')
            existing=custom.read_text() if custom.exists() else ''
            existing=re.sub(r'(?m)^# READY PLAYER ONE USB CONTROLLER\nif [^\n]+\n[ \t]*nohup python3 /userdata/system/ready-player-one/usb-controller.py[^\n]*\nfi\n?', '', existing)
            write_text(custom,prepend(existing,CUSTOM_HOOK))
            custom.chmod(0o755)
            # Stop only this controller's old process so upgrades actually take effect.
            for proc in Path('/proc').iterdir():
                if not proc.name.isdigit():
                    continue
                try:
                    argv=(proc/'cmdline').read_bytes().split(b'\0')
                    if len(argv)>1 and argv[1] in (str(script).encode(),b'/boot/ready-player-one/usb-controller.py'):
                        os.kill(int(proc.name),signal.SIGTERM)
                except (FileNotFoundError,ProcessLookupError):
                    pass
            with (state/'usb-controller.lock').open('a') as lock:
                for attempt in range(100):
                    try:
                        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
                        break
                    except BlockingIOError:
                        time.sleep(0.1)
                else:
                    raise RuntimeError('The previous USB Controller did not stop.')
            subprocess.run(['python3',str(script),'--once'],check=True,timeout=30)
            os.sync()
        finally:
            if readonly:
                subprocess.run(['mount','-o','remount,ro','/boot'],check=True,capture_output=True)
        subprocess.Popen(['python3',str(script)],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL,start_new_session=True)

if __name__ == '__main__':
    main()
