#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{fs, os::windows::process::CommandExt, process::Command, time::{SystemTime, UNIX_EPOCH}};

const UNDO: &str = include_str!("../undo.ps1");
const ICON: &[u8] = include_bytes!("../icon.png");

fn main() {
    let unique = SystemTime::now().duration_since(UNIX_EPOCH).map(|value| value.as_nanos()).unwrap_or(0);
    let root = std::env::temp_dir().join(format!("rp1-dual-boot-undo-{}-{unique}", std::process::id()));
    let script = root.join("undo.ps1");
    let icon = root.join("dual-boot-undo.png");
    if fs::create_dir_all(&root).and_then(|_| fs::write(&script, format!("\u{feff}{UNDO}"))).and_then(|_| fs::write(&icon, ICON)).is_err() { return; }
    let mut command = Command::new("powershell.exe");
    command.creation_flags(0x08000000);
    let _ = command.args(["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File"]).arg(&script).arg("-IconPath").arg(&icon).status();
    let _ = fs::remove_dir_all(root);
}
