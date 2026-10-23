# Ready Player One

Tauri desktop wrapper for the Ready Player One interface and its local Node backend.

## Development

```powershell
npm install
npm run dev
```

The Node backend serves the original interface on `http://localhost:8787` and handles Batocera discovery, SSH, and file transfers.

## Local folders

Console games, Ports, and Pygame games live in `roms/<system>/`.
Genesis uses `roms/megadrive/`; PS1 uses `roms/ps1/` locally and maps to
`/userdata/roms/psx` on Batocera. Music and karaoke remain in `music/` and
`karaoke/`. BIOS/keys remain in `bios-cache/`, and layouts in `Layouts/`.

The application identifier and existing browser storage keys intentionally retain
their legacy names so saved layouts, machine selections, and settings survive.
Machine-side Batocera paths are unchanged. Start with `Start Ready Player One.bat`.

## Ready Player Two source

The complete Ready Player Two Windows-companion source is embedded at
`companions/ready-player-two`. RP1 distributes the compiled companion from
`ui/ready-player-two.exe`.

To rebuild the companion and automatically replace RP1's bundled executable:

```powershell
npm run build:rp2
```

The build requires a working Rust/Cargo toolchain. Generated Cargo output remains
excluded from the RP1 project.
