#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{
    fs,
    os::windows::process::CommandExt,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

const SETUP: &str = include_str!("../../setup.ps1");
const NATIVE_UI: &str = include_str!("../../native-ui.ps1");
const DUAL_BOOT_WORKER: &str = include_str!("../../dual-boot-worker.ps1");
const SEVEN_ZIP_EXE: &[u8] = include_bytes!("../../vendor/7zip/7z.exe");
const SEVEN_ZIP_DLL: &[u8] = include_bytes!("../../vendor/7zip/7z.dll");
const SEVEN_ZIP_LICENSE: &str = include_str!("../../vendor/7zip/License.txt");
const WINDOWS_BOOT_ICON: &[u8] = include_bytes!("../../boot-theme/windows11.png");
const BATOCERA_BOOT_ICON: &[u8] = include_bytes!("../../boot-theme/batocera.png");
const DUAL_BOOT_UNDO: &[u8] = include_bytes!("../../../../ui/dual-boot-undo.exe");

fn install_dual_boot_undo_shortcut() -> Result<(PathBuf, PathBuf), String> {
    let local_app_data = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "Windows did not provide a Local AppData folder.".to_string())?;
    let tools_root = local_app_data.join("Ready Player Two").join("Tools");
    let undo_path = tools_root.join("Dual Boot Undo.exe");
    fs::create_dir_all(&tools_root).map_err(|error| error.to_string())?;
    let needs_write = fs::read(&undo_path)
        .map(|bytes| bytes != DUAL_BOOT_UNDO)
        .unwrap_or(true);
    if needs_write {
        fs::write(&undo_path, DUAL_BOOT_UNDO).map_err(|error| error.to_string())?;
    }

    let shortcut_script = r#"
$ErrorActionPreference='Stop'
$target=$env:RP2_DUAL_BOOT_UNDO
if([string]::IsNullOrWhiteSpace($target) -or -not (Test-Path -LiteralPath $target -PathType Leaf)){throw 'The embedded Dual Boot Undo tool is missing.'}
$desktop=[Environment]::GetFolderPath('Desktop')
if([string]::IsNullOrWhiteSpace($desktop)){throw 'Windows did not provide a Desktop folder.'}
$shortcutPath=Join-Path $desktop 'Dual Boot Undo.lnk'
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath=$target
$shortcut.WorkingDirectory=Split-Path -Parent $target
$shortcut.IconLocation=($target + ',0')
$shortcut.Description='Undo the RP2-managed Batocera shared dual-boot installation'
$shortcut.Save()
if(-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)){throw 'Windows did not create the Dual Boot Undo desktop shortcut.'}
[Console]::Out.Write($shortcutPath)
"#;
    let mut command = Command::new("powershell.exe");
    command.creation_flags(0x08000000);
    let output = command
        .env("RP2_DUAL_BOOT_UNDO", &undo_path)
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            shortcut_script,
        ])
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let shortcut_path = Path::new(String::from_utf8_lossy(&output.stdout).trim()).to_path_buf();
    if shortcut_path.as_os_str().is_empty() || !shortcut_path.is_file() {
        return Err("Dual Boot Undo desktop shortcut could not be verified.".to_string());
    }
    Ok((undo_path, shortcut_path))
}

fn main() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|time| time.as_nanos())
        .unwrap_or(0);
    let run_root = std::env::temp_dir().join(format!(
        "ready-player-two-native-{}-{unique}",
        std::process::id()
    ));
    let setup_path = run_root.join("setup.ps1");
    let ui_path = run_root.join("native-ui.ps1");
    let worker_path = run_root.join("dual-boot-worker.ps1");
    let seven_zip_path = run_root.join("7z.exe");
    let seven_zip_dll_path = run_root.join("7z.dll");
    let windows_boot_icon_path = run_root.join("windows11.png");
    let batocera_boot_icon_path = run_root.join("batocera.png");
    let log_root = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("Ready Player Two");
    let log_path = log_root.join("startup.log");
    let license_path = log_root.join("7zip-license.txt");
    let _ = fs::create_dir_all(&log_root);
    let result = (|| -> Result<i32, String> {
        fs::create_dir_all(&run_root).map_err(|error| error.to_string())?;
        // Windows PowerShell 5.1 treats BOM-less script files as the active
        // ANSI code page. Write a UTF-8 BOM so embedded scripts parse exactly
        // as authored on every Windows locale.
        fs::write(&setup_path, format!("\u{feff}{SETUP}")).map_err(|error| error.to_string())?;
        fs::write(&ui_path, format!("\u{feff}{NATIVE_UI}")).map_err(|error| error.to_string())?;
        fs::write(&worker_path, format!("\u{feff}{DUAL_BOOT_WORKER}"))
            .map_err(|error| error.to_string())?;
        fs::write(&seven_zip_path, SEVEN_ZIP_EXE).map_err(|error| error.to_string())?;
        fs::write(&seven_zip_dll_path, SEVEN_ZIP_DLL).map_err(|error| error.to_string())?;
        fs::write(&windows_boot_icon_path, WINDOWS_BOOT_ICON).map_err(|error| error.to_string())?;
        fs::write(&batocera_boot_icon_path, BATOCERA_BOOT_ICON)
            .map_err(|error| error.to_string())?;
        fs::write(&license_path, SEVEN_ZIP_LICENSE).map_err(|error| error.to_string())?;
        let shortcut_detail = match install_dual_boot_undo_shortcut() {
            Ok((tool, shortcut)) => format!(
                "Dual Boot Undo tool: {}\nDesktop shortcut: {}\n",
                tool.display(),
                shortcut.display()
            ),
            Err(error) => format!("Dual Boot Undo shortcut needs attention: {error}\n"),
        };
        fs::write(&log_path, format!("Ready Player Two 1.0.58 launched with the native Windows interface.\n{shortcut_detail}"))
            .map_err(|error| error.to_string())?;
        let mut process = Command::new("powershell.exe");
        process.creation_flags(0x08000000);
        process.env("RP2_7Z_PATH", &seven_zip_path);
        let status = process
            .args(["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&ui_path)
            .arg("-SetupPath")
            .arg(&setup_path)
            .arg("-WindowsBootIconPath")
            .arg(&windows_boot_icon_path)
            .arg("-BatoceraBootIconPath")
            .arg(&batocera_boot_icon_path)
            .status()
            .map_err(|error| error.to_string())?;
        Ok(status.code().unwrap_or(-1))
    })();
    let detail = match result {
        Ok(code) => format!("Native interface exited with code {code}.\n"),
        Err(error) => format!("Native interface failed: {error}\n"),
    };
    let existing_log = fs::read_to_string(&log_path).unwrap_or_default();
    let _ = fs::write(
        &log_path,
        format!("{existing_log}Ready Player Two 1.0.58\n{detail}"),
    );
    let _ = fs::remove_file(setup_path);
    let _ = fs::remove_file(ui_path);
    let _ = fs::remove_file(worker_path);
    let _ = fs::remove_file(seven_zip_path);
    let _ = fs::remove_file(seven_zip_dll_path);
    let _ = fs::remove_file(windows_boot_icon_path);
    let _ = fs::remove_file(batocera_boot_icon_path);
    let _ = fs::remove_dir(run_root);
}
