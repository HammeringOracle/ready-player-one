#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{fs, os::windows::process::CommandExt, process::Command, time::{SystemTime, UNIX_EPOCH}};

const SETUP: &str = include_str!("../../setup.ps1");
const NATIVE_UI: &str = include_str!("../../native-ui.ps1");

fn main() {
    let unique = SystemTime::now().duration_since(UNIX_EPOCH).map(|time| time.as_nanos()).unwrap_or(0);
    let run_root = std::env::temp_dir().join(format!("ready-player-two-native-{}-{unique}", std::process::id()));
    let setup_path = run_root.join("setup.ps1");
    let ui_path = run_root.join("native-ui.ps1");
    let log_root = std::env::var_os("LOCALAPPDATA").map(std::path::PathBuf::from).unwrap_or_else(std::env::temp_dir).join("Ready Player Two");
    let log_path = log_root.join("startup.log");
    let _ = fs::create_dir_all(&log_root);
    let result = (|| -> Result<i32, String> {
        fs::create_dir_all(&run_root).map_err(|error| error.to_string())?;
        fs::write(&setup_path, SETUP).map_err(|error| error.to_string())?;
        fs::write(&ui_path, NATIVE_UI).map_err(|error| error.to_string())?;
        fs::write(&log_path, "Ready Player Two 1.0.12 launched with the native Windows interface.\n").map_err(|error| error.to_string())?;
        let mut process = Command::new("powershell.exe");
        process.creation_flags(0x08000000);
        let status = process.args(["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&ui_path).arg("-SetupPath").arg(&setup_path)
            .status().map_err(|error| error.to_string())?;
        Ok(status.code().unwrap_or(-1))
    })();
    let detail = match result { Ok(code) => format!("Native interface exited with code {code}.\n"), Err(error) => format!("Native interface failed: {error}\n") };
    let _ = fs::write(&log_path, format!("Ready Player Two 1.0.12\n{detail}"));
    let _ = fs::remove_file(setup_path);
    let _ = fs::remove_file(ui_path);
    let _ = fs::remove_dir(run_root);
}
