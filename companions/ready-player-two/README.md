# Ready Player Two

Ready Player Two advertises the Windows PC itself by computer name to Ready Player One, even when no supported game frontend is installed. **Inspect Windows Drive** remains an optional read-only check. **Configure All** creates the account-restricted `RP2Status` and `RP2Stage` shares, persistent discovery, and an administrator-protected dual-boot worker. Shared Dual Boot in RP1 stages the Batocera image and pinned rEFInd package, then sends a confirmed request to that worker. The worker rechecks the disk, prepares BATOCERA and SHARE partitions, installs the rEFInd boot menu, and reports status to RP1. The first boot of both operating systems still requires physical verification; no software can guarantee that solely from the Windows session before reboot.

## Shared-drive dual boot (version 1.0.22)

1. Back up the Windows disk and have Windows recovery media available. This operation can leave Windows unbootable if partitioning or boot setup goes wrong.
2. Install the current `ui/ready-player-two.exe` from RP1 on the Windows PC; open it and run **Configure All** once on a trusted Private LAN. The staging account must be a direct local administrator. This installs the protected worker; older RP2 builds cannot accept the install request.
3. In RP1, use **Add / Update Credentials** for that Windows machine, then right-click it and open **Shared Dual Boot**. Choose the Batocera 43.1 image, Windows size, and desired default OS. Confirm a restorable backup and Windows recovery USB, then select **Install Dual Boot**. RP1 transfers and verifies the image and rEFInd archive before sending the install request.
4. Keep the RP2 window open on the Windows PC to see live status and blockers on its display; RP1 shows the same installation progress. RP2 repeats the disk and image safety checks, prepares BATOCERA and SHARE partitions, backs up the boot configuration, installs rEFInd, and writes an install journal. Do not retry a failed install blindly. The journal is `%ProgramData%\Ready Player Two\staging\install-state.json`.
5. Reboot and test both Windows and Batocera. An `awaiting-first-boot` status means installation commands completed, not that both operating systems have been boot-tested.

The partition and boot-manager actions have not been exercised on this user's physical Windows PC or a disposable Windows test VM. Do not treat a successful build or image stage as proof of a bootable dual boot.

**Configure All** now honors the explicit blank-password checkbox even when no game frontend is detected. That checkbox changes Windows network-logon policy for *all local accounts* on this PC; leave it unchecked unless needed. A real Windows account password is safer and is not the same as a PIN. RP2 reports whether its local network-logon check passed; remote SMB access still needs verification from RP1. Windows error 1327 can also be caused by other account restrictions.

Latest portable built into RP1: **`ui/ready-player-two.exe` (1.0.56)**. Copy it to the Windows PC and run Configure All once to update the protected worker.

The pinned rEFInd 0.14.2 binary archive comes from [the upstream SourceForge project](https://sourceforge.net/projects/refind/files/0.14.2/refind-bin-0.14.2.zip/download), SHA-256 `410c7828c4fec2f2179bd956073522415831d27c00416381b8f71153c190a311`. Its bundled license and upstream source references are retained in the archive.

At startup, choose the installed application. No check runs until you choose. You can switch later using the Application dropdown.

Choose the application first. RetroBat and RetroArch share their application folders. ES-DE shares its ROM library as `ROMs` and requires the `systems.txt` marker ES-DE creates there. Emu-Station shares its application folder as `Emu-Station` and uses the `roms` subfolder. Missing ROM folders are created only for RetroArch and Emu-Station, without moving existing content. Each application’s share is configured separately.

1.0.7 validates the selected local account is enabled and unexpired, removes a conflicting RetroBat share deny for that exact account, and keeps other users' permissions intact. When blank-password access is selected, it also sets Classic local-account authentication (`ForceGuest=0`) and makes ONE empty-password network-type logon attempt, then checks ROM directory read access under that identity. This can increment failed-login counts if the password is not blank; there are no automatic retries. It does not reset passwords, enable disabled accounts, bypass deny-network-logon policies, or disable UAC/SMB signing. Successful local checks do not prove that a different PC can connect. Errors are shown before progress logs.

Classic authentication is a PC-wide setting. To restore Guest-only mode if desired, use Local Security Policy > Local Policies > Security Options > Network access: Sharing and security model for local accounts. A password-protected local sharing account is recommended. The client must use the displayed account, rather than its own Windows login; incorrect saved credentials on the client still need correction there.

Run the current **`ui/ready-player-two.exe` on the Windows PC**, not the Ready Player One PC.

1. Check the detected computer name, folder, and Windows account.
2. Choose your trusted home Wi-Fi or Ethernet network, not a VPN.
3. If the network is Public, tick the trusted-network checkbox to authorize changing it to Private.
4. Optional: check **Allow accounts with blank passwords to connect** only if needed. This disables Windows' blank-password network-logon restriction PC-wide for ALL local accounts, not just RetroBat. It does not remove or reset passwords. Unchecked leaves the policy unchanged. A password-protected sharing account is safer, especially than a blank-password Administrator account.
5. Click **Set up sharing** and approve Windows administrator permission.
5. On the Ready Player One PC, open the displayed network path in File Explorer. Sign in with the selected Windows account's password, not its PIN. This app does not store passwords.

Setup validates the RetroBat folder, creates/updates only the RetroBat share, adds account-specific Modify file access, removes broad Everyone/Users/Guests/Authenticated Users share grants, starts the Windows Server service, and creates a scoped Private-LAN TCP 445 firewall rule. Existing unrelated permissions and firewall rules are preserved. Effective access may still be restricted by explicit NTFS deny rules, protected subfolders, domain policy, VPNs, or router client isolation.

The app embeds its interface and setup script: Node.js, Rust, and Tauri are not needed on the destination PC. Windows 10/11 x64 and Microsoft Edge WebView2 Runtime are required. Windows may warn about the unsigned executable; it is not digitally signed.

No sharing is enabled simply by opening the app. Read-only status runs first. It does not modify or delete ROMs, enable SMB1, or disable Windows Firewall. Ready Player One detection and transfer remain separate features. RetroPie is intentionally excluded because it uses the SSH/SFTP workflow.

To undo sharing: remove the selected `RetroBat`, `RetroArch`, `ROMs`, or `Emu-Station` share in Windows Computer Management > Shared Folders > Shares; remove its corresponding `ReadyPlayerTwo-<share>-SMB-<interface index>` firewall rule in Windows Defender Firewall with Advanced Security. Any account permission added to the folder and any network-profile/service change must be reviewed separately in Windows. There is no automatic rollback of existing permissions.

Source is included. Build from `src-tauri` with `cargo build --release`. The output is `src-tauri/target/release/ready-player-two.exe` unless `CARGO_TARGET_DIR` is set.

Version 1.0.3 adds persistent discovery. After setup, a hidden startup task advertises the machine name and every detected supported frontend every 10 seconds across all active LAN adapters, so Ready Player One can discover it after either computer restarts or its IP address changes.

To restore blank-password protection, enable Local Security Policy > Local Policies > Security Options > Accounts: Limit local account use of blank passwords to console logon only. On Windows editions without that editor, an administrator can set DWORD `LimitBlankPasswordUse` to `1` under `HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Lsa`. Organization policy can override this setting. Existing unrelated firewall rules may allow wider access; this app does not narrow those rules.
