# Ready Player Two

Latest portable: **Ready Player Two 1.0.11.exe**. Copy it to the Windows PC with RetroBat, RetroArch, ES-DE, or Emu-Station and run it there.

At startup, choose the installed application. No check runs until you choose. You can switch later using the Application dropdown.

Choose the application first. RetroBat and RetroArch share their application folders. ES-DE shares its ROM library as `ROMs` and requires the `systems.txt` marker ES-DE creates there. Emu-Station shares its application folder as `Emu-Station` and uses the `roms` subfolder. Missing ROM folders are created only for RetroArch and Emu-Station, without moving existing content. Each application’s share is configured separately.

1.0.7 validates the selected local account is enabled and unexpired, removes a conflicting RetroBat share deny for that exact account, and keeps other users' permissions intact. When blank-password access is selected, it also sets Classic local-account authentication (`ForceGuest=0`) and makes ONE empty-password network-type logon attempt, then checks ROM directory read access under that identity. This can increment failed-login counts if the password is not blank; there are no automatic retries. It does not reset passwords, enable disabled accounts, bypass deny-network-logon policies, or disable UAC/SMB signing. Successful local checks do not prove that a different PC can connect. Errors are shown before progress logs.

Classic authentication is a PC-wide setting. To restore Guest-only mode if desired, use Local Security Policy > Local Policies > Security Options > Network access: Sharing and security model for local accounts. A password-protected local sharing account is recommended. The client must use the displayed account, rather than its own Windows login; incorrect saved credentials on the client still need correction there.

Run **Ready Player Two 1.0.11.exe on the Windows PC containing your selected installation**, not the Ready Player One PC unless that frontend is installed there too.

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
