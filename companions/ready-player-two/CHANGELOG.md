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
