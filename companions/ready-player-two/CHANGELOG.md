# Ready Player Two 1.0.69

- Creates and verifies a dedicated `Ready Player One Dual Boot` UEFI entry, places it first, and records its identifier so Dual Boot Undo removes only that entry. This fixes firmware that bypasses the redirected generic Windows Boot Manager entry.

- Configure All now ends with an explicit instruction to return to RP1 and run Windows/Batocera Dual Boot.

# Ready Player Two 1.0.67

- Hide the verified RP2-managed BATOCERA and SHARE partitions from Windows after installation and during Configure All maintenance, preventing Windows format prompts without touching unrelated disks.

# Ready Player Two 1.0.66

- Increase the visible inside-edge gap between the Windows 11 and Batocera boot artwork from approximately 8 px to 12 px without changing the tile size.

# Ready Player Two 1.0.65

- Keep 384-pixel boot choices while adding a padded custom selector so the tiles no longer visually touch.
- Enlarge the Windows and Batocera artwork inside each tile and make 10 seconds the permanent default boot-menu wait.

# Ready Player Two 1.0.64

- Reduce the rEFInd boot-menu icons from the oversized 768-pixel setting to 384 pixels while retaining the high-resolution logo sources.
- Add configurable boot-menu timeout and default operating-system settings to the RP1-managed dual-boot plan.

# Ready Player Two 1.0.63

- Dual Boot Undo now presents a permanent-data-loss warning and requires typing `Delete All` (case-insensitive) before it can remove Batocera, SHARE, games, saves, artwork, settings, and other Batocera data.
- Undo now requires an RP2-owned versioned journal, matching computer identity, installation ID, boot paths, exact partition ownership, expected adjacent disk geometry, matching reclaimed capacity, and a verified Windows EFI loader before any partition can be removed.
- The Undo launcher now waits for its administrator process and shows/logs startup failures instead of silently flashing and closing.
- The typed `Delete All` safeguard now uses an explicit ordinal case-insensitive comparison, accepting any capitalization exactly as promised.

# Ready Player Two 1.0.56

- Prepare shared-drive Batocera installations with a persistent ext4 container for Xenia's internal runtime when `/userdata` uses NTFS or exFAT.
- Preserve native Linux userdata filesystems and avoid installing or configuring the Windows/Wine console.

# Ready Player Two 1.0.22

- Bring the RP2 window to the front when it opens without leaving it always-on-top.

# Ready Player Two 1.0.21

- Show live Shared Dual Boot status and failure on the Windows PC while the RP2 window is open.
- Show the current minimum safe Windows size and which disk has a BATOCERA volume during drive inspection and preflight failure.

# Ready Player Two 1.0.20

- Make Shared Dual Boot a single confirmed RP1 workflow after one-time RP2 configuration.
- Install an administrator-protected RP2 worker that accepts only machine-matched, time-limited dual-boot requests from the restricted staging share.
- Stage a pinned, SHA-256-verified rEFInd package and add Windows/Batocera boot entries with a selected default, BCD backup, failure journal, and rollback attempt.
- Report `awaiting-first-boot` only after installation commands finish; both operating systems still require real boot testing.

# Ready Player Two 1.0.17

- Add restricted staging share for a Batocera image sent by RP1 and a local SHA-256 review with fresh drive checks.
- Bundle 7-Zip command-line files and license for local image extraction.
- Add an explicit, elevated Prepare Dual Boot action with fresh disk checks, a stop-on-error journal, and a guided Grub2Win handoff. The action is never automatic when RP2 starts or when RP1 stages an image.

# Ready Player Two 1.0.11

- Announces every detected supported program immediately when RP2 opens.
- Broadcasts through every active IPv4 LAN adapter when no adapter is selected yet.
- RP1 can create a new MAC-based tag before share setup finishes.

# Ready Player Two 1.0.10

- Gives every native Windows control explicit high-contrast colors.
- Replaces decorative punctuation with plain text.

# Ready Player Two 1.0.9

- Replaced the WebView2 interface with a native Windows interface.
- Retains automatic detection, secured share configuration, and persistent RP1 discovery.
- Runs on Windows machines where the embedded browser window disappears.

# Ready Player Two 1.0.7

- Forces the main window onto the primary monitor before maximizing it.
- Restores normal decorations and taskbar visibility and clears fullscreen state.

# Ready Player Two 1.0.6

- Explicitly restores, maximizes, and focuses the main window at startup.
- Temporarily raises the window for three seconds, then returns it to normal stacking.
- Records successful main-window creation in the persistent startup log.

# Ready Player Two 1.0.5

- Records every launch in a persistent Local AppData log.
- Blocks an unexplained close during the first five seconds and records it separately.

# Ready Player Two 1.0.4

- Shows and records the actual startup error instead of silently closing.

# Ready Player Two 1.0.3

- Installs a persistent hidden discovery beacon during successful setup.
- Announces all detected supported frontends every 10 seconds and at Windows startup.
- Broadcasts through every active LAN adapter and follows hostname/IP changes.

# Ready Player Two 1.0.2

- Renamed the Ready Player One sharing companion and its application identity to Ready Player Two.

# Retro Sharing 1.0.8

- Added ES-DE sharing through its ROM directory as the `ROMs` share.
- Added Emu-Station sharing through its application directory as the `Emu-Station` share.
- Added platform cards and official logos for both applications.
- Updated companion wording from Rec Room to Ready Player One.
- RetroPie remains intentionally excluded because it uses a separate SSH/SFTP workflow.

# Retro Sharing 1.0.7

- Separate verified local share configuration from unverified account/network access.
- Translate empty-password login failures into specific guidance for incorrect credentials, denied logon policy, or account lockout.
- Block repeated empty-password attempts for an account that failed during the current app run.
- Retain explicit warnings that selected PC-wide policies remain configured; no automatic rollback, password resets, or authentication bypass.
- These checks do not prove a remote connection succeeds. Remote connectivity must still be tested from Rec Room.

# Retro Sharing 1.0.6

- Selecting RetroArch checks for `retroarch.exe` in `C:\RetroArch`, then `C:\RetroArch-Win64`.
- The detected folder is shown in the form and used for setup. The network share remains `RetroArch`.
- Explicit custom folder choices are preserved. A valid standard installation takes priority when both exist.
- No sharing or Windows security settings change during folder detection.
