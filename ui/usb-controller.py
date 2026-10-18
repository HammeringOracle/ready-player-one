#!/usr/bin/env python3
"""Maintain the portable inventory and apply explicit USB deletion requests."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import time
import xml.etree.ElementTree as ET

VERSION = 2

def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('w', encoding='utf-8') as stream:
        json.dump(data, stream, ensure_ascii=False, separators=(',', ':'))
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)

def safe_target(userdata, system, name):
    if not isinstance(system, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', system):
        raise ValueError('Invalid system')
    if not isinstance(name, str) or not name or any(c in name for c in '\\:\0'):
        raise ValueError('Invalid game path')
    parts = name.split('/')
    if any(not part or part.startswith('.') for part in parts):
        raise ValueError('Invalid game path')
    root = userdata.resolve()
    base = userdata / 'music' if system == 'music' else userdata / 'roms' / system
    target = base.joinpath(*parts)
    # Reject symlinks in the selected path, including a redirected system folder.
    cursor = target
    while cursor != userdata:
        if cursor.is_symlink():
            raise ValueError('The selected path is a symbolic link')
        cursor = cursor.parent
    resolved = target.resolve()
    if root not in resolved.parents or base.resolve() not in resolved.parents:
        raise ValueError('Game path is outside its system folder')
    return base, target

def prune_gamelist(base, name):
    file = base / 'gamelist.xml'
    if not file.exists():
        return
    if file.is_symlink():
        raise ValueError('gamelist.xml is a symbolic link')
    tree = ET.parse(file)
    changed = False
    for entry in list(tree.getroot()):
        value = (entry.findtext('path') or '').replace('\\', '/')
        while value.startswith('./'):
            value = value[2:]
        if entry.tag in ('game', 'folder') and (value == name or value.startswith(name + '/')):
            tree.getroot().remove(entry)
            changed = True
    if changed:
        temporary = file.with_name(file.name + '.rpo-tmp')
        tree.write(temporary, encoding='utf-8', xml_declaration=True)
        os.replace(temporary, file)

def apply_deletions(output, userdata):
    queue = output / 'delete-queue.json'
    if not queue.exists():
        return None, []
    data = json.loads(queue.read_text(encoding='utf-8'))
    if data.get('schemaVersion') != 1 or not isinstance(data.get('operations'), list):
        raise ValueError('Invalid USB deletion queue')
    remaining, completed = [], []
    for operation in data['operations']:
        try:
            if not isinstance(operation, dict) or operation.get('action') != 'delete' or not isinstance(operation.get('id'), str):
                raise ValueError('Invalid deletion instruction')
            base, target = safe_target(userdata, operation.get('system'), operation.get('name'))
            if target.is_dir():
                shutil.rmtree(target)
            elif target.exists():
                target.unlink()
            prune_gamelist(base, operation['name'])
            completed.append({**operation, 'appliedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
        except Exception as error:
            if not isinstance(operation, dict):
                raise ValueError('Invalid deletion instruction') from error
            remaining.append({**operation, 'error':str(error)})
    return remaining, completed

def inventory(userdata):
    systems = {}
    root = userdata / 'roms'
    ignored = {'gamelist.xml', '_info.txt', 'media', 'images', 'manuals', 'videos', 'downloaded_images'}
    if root.is_dir():
        for system in sorted(root.iterdir()):
            if not system.is_dir() or system.is_symlink() or system.name.startswith('.'):
                continue
            games = []
            for entry in sorted(system.iterdir()):
                if entry.name.startswith('.') or entry.name.lower() in ignored or entry.name.endswith('.bw-part'):
                    continue
                if entry.is_symlink():
                    continue
                try:
                    games.append({'name':entry.name, 'path':str(entry.relative_to(root)).replace(os.sep,'/'),
                                  'kind':'folder' if entry.is_dir() else 'file',
                                  'size':None if entry.is_dir() else entry.stat().st_size})
                except FileNotFoundError:
                    continue
            if games:
                systems[system.name] = games
    music = userdata / 'music'
    if music.is_dir():
        songs = [{'name':str(p.relative_to(music)).replace(os.sep,'/'), 'kind':'file', 'size':p.stat().st_size}
                 for p in music.rglob('*') if p.is_file() and not p.is_symlink() and p.suffix.lower() in ('.mp3','.flac')]
        if songs:
            systems['music'] = songs
    space = shutil.disk_usage(userdata)
    return {'schemaVersion':1, 'controllerVersion':VERSION,
            'machine':{'hostname':socket.gethostname(), 'platform':'batocera'},
            'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'storage':{'totalKb':space.total/1024, 'freeKb':space.free/1024}, 'systems':systems}

def update(output, userdata):
    remaining, completed = apply_deletions(output, userdata)
    # Publish the inventory before acknowledging requests, so a failed write can retry.
    snapshot = inventory(userdata)
    atomic_json(output / 'library.json', snapshot)
    if remaining is not None:
        atomic_json(output / 'delete-queue.json', {'schemaVersion':1, 'operations':remaining})
    return completed

def main():
    import fcntl
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    userdata = Path('/userdata')
    state = userdata / 'system' / 'ready-player-one'
    state.mkdir(parents=True, exist_ok=True)
    with (state / 'usb-controller.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        while True:
            readonly = False
            try:
                mounts = Path('/proc/mounts').read_text().splitlines()
                readonly = any(line.split()[1] == '/boot' and 'ro' in line.split()[3].split(',') for line in mounts)
                if readonly:
                    subprocess.run(['mount','-o','remount,rw','/boot'], check=True, capture_output=True)
                completed = update(Path('/boot/ready-player-one'), userdata)
                if completed:
                    with (state / 'usb-deletions.log').open('a', encoding='utf-8') as log:
                        for operation in completed:
                            log.write(json.dumps(operation) + '\n')
                os.sync()
            except Exception as error:
                with (state / 'usb-controller.log').open('a', encoding='utf-8') as log:
                    log.write(datetime.datetime.now().isoformat() + ' ' + repr(error) + '\n')
                if args.once:
                    raise
            finally:
                if readonly:
                    subprocess.run(['mount','-o','remount,ro','/boot'], check=True, capture_output=True)
            if args.once:
                return
            time.sleep(30)

if __name__ == '__main__':
    main()
