# Platform logo sources

These upstream logos identify their respective projects; Ready Player One is not affiliated with them.

- Lakka color berry: https://www.lakka.tv/images/fav64.png (unmodified official asset)
- RetroArch: https://github.com/libretro/RetroArch/blob/master/media/ico_src/icon256.png
- RetroPie: https://retropie.org.uk/wp-content/uploads/2016/04/RetroPie_Logo.png
- ES-DE: https://es-de.org/ (official ES-DE logo)
- Emu-Station: https://emu-station.com/icon.png

Discovery checks the installation, not just an open SMB port. RetroBat takes
precedence over its bundled RetroArch. Lakka uses its Configfiles/retroarch and
Roms shares; its standard advertised hostname can identify an inaccessible share
without claiming library access. A standalone Windows RetroArch installation must
be shared as RetroArch (containing retroarch.exe); roms/system folders are used
for the optional library mapping. No Windows sharing or firewall policy is changed.

RetroPie is identified by its standard `roms` and `configs` shares. ES-DE is
identified by `systems.txt` in a share named `ROMs`. Emu-Station is identified
only when its local library is deliberately shared as `Emu-Station`, with a
`roms` folder beneath it. This prevents an ordinary Windows PC from being
misidentified merely because it runs one of these frontends.
