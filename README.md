# Ready Player One

Ready Player One is a Tauri desktop game-library manager with a local Node backend. It discovers supported machines, manages console libraries, and transfers user-supplied games and artwork. Wired mostly for Batocera, it will also discover Recalbox, Lakka, Retrobat, RetroArch, RetroPie, ES-DE and Emu-Station.

## Development

```powershell
npm install
npm run dev
```

The Node backend serves the interface on `http://localhost:8789` and handles discovery, SSH, and file transfers. A system installation of Node.js is required for development and source builds.

## Build

```powershell
npm install
npm run build
```

Compiled applications and bundled runtimes are release artifacts and are not stored in this source repository.

## Local folders

Console games, Ports, and Pygame games live in `roms/<system>/`.
Genesis uses `roms/megadrive/`; PS1 uses `roms/ps1/` locally and maps to
`/userdata/roms/psx` on Batocera. Music and karaoke remain in `music/` and
`karaoke/`. BIOS/keys remain in `bios-cache/`, and layouts in `Layouts/`.

The application identifier and existing browser storage keys intentionally retain
their legacy names so saved layouts, machine selections, and settings survive.
Machine-side Batocera paths are unchanged.

## Content policy

This source repository does not contain game ROMs, cover libraries, BIOS or firmware files, encryption keys, proprietary emulator libraries, purchased software, bundled installers, credentials, machine data, or compiled executables. Users must supply content they are legally entitled to use. RP1 Medicine will heal Ready Player One. See [PUBLIC_RELEASE.md](PUBLIC_RELEASE.md).
