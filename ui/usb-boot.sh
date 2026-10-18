#!/bin/bash
# READY PLAYER ONE USB BOOT V3
set -e
case "${1:-start}" in start) ;; *) exit 0 ;; esac
boot_readonly=0
if awk '$2 == "/boot" && $4 ~ /(^|,)ro(,|$)/ { found=1 } END { exit !found }' /proc/mounts; then
  boot_readonly=1
  mount -o remount,rw /boot
fi
restore_boot() { if [ "$boot_readonly" = 1 ]; then mount -o remount,ro /boot; fi; }
trap restore_boot EXIT
mkdir -p /userdata/roms /userdata/music
if [ -d /boot/bw-import ]; then
  [ ! -d /boot/bw-import/roms ] || cp -af /boot/bw-import/roms/. /userdata/roms/
  [ ! -d /boot/bw-import/music ] || cp -af /boot/bw-import/music/. /userdata/music/
  for legacy in /boot/bw-import/*; do
    [ -d "$legacy" ] || continue
    case "$(basename "$legacy")" in roms|music) continue ;; esac
    mkdir -p "/userdata/roms/$(basename "$legacy")"
    cp -af "$legacy"/. "/userdata/roms/$(basename "$legacy")/"
  done
  # Remove only this dedicated import directory, after all copies succeeded.
  rm -rf /boot/bw-import
fi
mkdir -p /userdata/system/ready-player-one
cp /boot/ready-player-one/usb-controller.py /userdata/system/ready-player-one/usb-controller.py.tmp
mv /userdata/system/ready-player-one/usb-controller.py.tmp /userdata/system/ready-player-one/usb-controller.py
python3 /userdata/system/ready-player-one/usb-controller.py --once
sync
restore_boot
trap - EXIT
nohup python3 /userdata/system/ready-player-one/usb-controller.py >/dev/null 2>&1 &
