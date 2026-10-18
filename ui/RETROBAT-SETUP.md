# RetroBat setup

Add Systems and Apply Layout use the SMB share on the selected RetroBat machine,
not Batocera SSH installers. No fixed IP or credentials are embedded.

Supported automatic prerequisites:

| System | Destination / action |
| --- | --- |
| PS1 | Verified cached BIOS to `bios` |
| PS2 | Verified cached BIOS to `bios/pcsx2/bios` |
| PS3 | Verified cached firmware to `bios/PS3UPDAT.PUP` |
| Wii U | Merge cached keys into `emulators/cemu/keys.txt` |
| Xbox | Verified cached BIOS to `bios`; missing open-source HDD to `saves/xbox/xbox_hdd.qcow2` |
| Xbox 360 | Missing upstream Windows Xenia to `emulators/xenia` |
| Karaoke | Missing upstream Windows PocketCDG to `emulators/retroarch/cores` |

This matches Ready Player One's existing automatic Batocera prerequisite coverage, not
every emulator's installation procedure. Other systems retain their existing
manual-setup notices. Missing proprietary files are reported, never downloaded.
RetroBat manages its other emulator downloads on first launch. RPCS3 still needs
its firmware installation prompt completed locally; copying the PUP is staging,
not an installed PS3 operating system. SMB does not remotely run that installer.
Karaoke requires matching CDG and audio files; Linux Karaoke launchers are not used.

Existing package files and Xbox disks are never overwritten. BIOS replacements
are backed up beside the destination; existing Wii U keys are preserved. Transfers
are verified and setup calls on each destination are serialized.

Sources:
- https://wiki.retrobat.org/systems-and-emulators/supported-game-systems/game-consoles/sony/playstation-2
- https://wiki.retrobat.org/systems-and-emulators/supported-game-systems/game-consoles/sony/playstation-3
- https://wiki.retrobat.org/systems-and-emulators/supported-game-systems/game-consoles/nintendo-game-consoles/wiiu
- https://github.com/RetroBat-Official/emulatorlauncher/blob/master/emulatorLauncher/Installer.cs
- https://buildbot.libretro.com/nightly/windows/x86_64/latest/
- https://github.com/xenia-project/release-builds-windows/releases/tag/v1.0.2844-master
- https://xemu.app/docs/required-files/

Tests: `node ui/test-retrobat-setup.cjs`. This uses isolated fixtures, not live ROMs.
