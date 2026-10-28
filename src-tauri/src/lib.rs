use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    os::windows::process::CommandExt,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmbeddedDisplayResult {
    opened: bool,
    host: String,
}

#[cfg(windows)]
mod embedded_display {
    use super::*;
    use std::time::Instant;

    type Hwnd = isize;
    type Bool = i32;
    type Dword = u32;
    type Lparam = isize;
    type LongPtr = isize;
    const GWLP_HWNDPARENT: i32 = -8;

    #[repr(C)]
    #[derive(Default)]
    struct Rect { left: i32, top: i32, right: i32, bottom: i32 }

    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(callback: extern "system" fn(Hwnd, Lparam) -> Bool, value: Lparam) -> Bool;
        fn GetWindowThreadProcessId(window: Hwnd, process_id: *mut Dword) -> Dword;
        fn IsWindowVisible(window: Hwnd) -> Bool;
        fn SetWindowLongPtrW(window: Hwnd, index: i32, value: LongPtr) -> LongPtr;
        fn GetWindowRect(window: Hwnd, rect: *mut Rect) -> Bool;
        fn SetForegroundWindow(window: Hwnd) -> Bool;
        fn SetWindowTextW(window: Hwnd, text: *const u16) -> Bool;
    }

    struct Search { pid: u32, found: Hwnd, area: i64 }
    extern "system" fn find_process_window(window: Hwnd, value: Lparam) -> Bool {
        let search = unsafe { &mut *(value as *mut Search) };
        let mut pid = 0;
        unsafe { GetWindowThreadProcessId(window, &mut pid); }
        if pid == search.pid && unsafe { IsWindowVisible(window) } != 0 {
            let mut rect = Rect::default();
            if unsafe { GetWindowRect(window, &mut rect) } != 0 {
                let area = i64::from((rect.right - rect.left).max(0)) * i64::from((rect.bottom - rect.top).max(0));
                if area > search.area { search.found = window; search.area = area; }
            }
        }
        1
    }

    fn find_window(pid: u32) -> Hwnd {
        let mut search = Search { pid, found: 0, area: 0 };
        unsafe { EnumWindows(find_process_window, &mut search as *mut Search as Lparam); }
        search.found
    }

    pub fn open(app: tauri::AppHandle, executable: String, host: String) -> Result<EmbeddedDisplayResult, String> {
        if executable.trim().is_empty() || !std::path::Path::new(&executable).is_file() {
            return Err("Moonlight is not installed. Open Display and install support first.".into());
        }
        let parent = app.get_webview_window("main")
            .ok_or_else(|| "The main RP1 window is unavailable.".to_string())?
            .hwnd().map_err(|error| format!("Could not access the main RP1 window: {error}"))?.0 as Hwnd;
        let mut command = Command::new(&executable);
        command.args(["stream", "--display-mode", "windowed"]);
        if !host.trim().is_empty() { command.arg(&host); }
        command.arg("Desktop");
        command.creation_flags(0x08000000);
        let child = command.spawn().map_err(|error| format!("Could not start Moonlight: {error}"))?;
        let pid = child.id();
        thread::spawn(move || {
            let started = Instant::now();
            thread::sleep(Duration::from_millis(1200));
            loop {
                let window = find_window(pid);
                if window != 0 {
                    let title: Vec<u16> = "Ready Player One — Display\0".encode_utf16().collect();
                    unsafe {
                        SetWindowLongPtrW(window, GWLP_HWNDPARENT, parent);
                        SetWindowTextW(window, title.as_ptr());
                        SetForegroundWindow(window);
                    }
                    break;
                }
                if started.elapsed() > Duration::from_secs(15) { break; }
                thread::sleep(Duration::from_millis(100));
            }
        });
        Ok(EmbeddedDisplayResult { opened: true, host })
    }
}

#[tauri::command]
fn open_embedded_display(app: tauri::AppHandle, executable: String, host: String) -> Result<EmbeddedDisplayResult, String> {
    #[cfg(windows)] { embedded_display::open(app, executable, host) }
    #[cfg(not(windows))] { let _ = (app, executable, host); Err("Embedded Display is currently available on Windows.".into()) }
}

#[tauri::command]
fn close_embedded_display(app: tauri::AppHandle) -> Result<(), String> {
    let _ = Command::new("taskkill").args(["/IM", "Moonlight.exe", "/T", "/F"])
        .creation_flags(0x08000000).output();
    let _ = app;
    Ok(())
}

fn find_project_root() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(current) = std::env::current_dir() {
        candidates.push(current);
    }
    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() {
            candidates.push(parent.to_path_buf());
        }
    }

    for candidate in candidates {
        for directory in candidate.ancestors() {
            if directory.join("ui").join("server.js").is_file() {
                return Some(directory.to_path_buf());
            }
        }
    }
    None
}

fn backend_is_running() -> bool {
    let address: SocketAddr = "127.0.0.1:8789".parse().expect("valid backend address");
    TcpStream::connect_timeout(&address, Duration::from_millis(150)).is_ok()
}

#[link(name = "kernel32")]
extern "system" {
    fn CreateMutexW(attributes: *mut std::ffi::c_void, owner: i32, name: *const u16) -> *mut std::ffi::c_void;
    fn GetLastError() -> u32;
    fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
}

struct DesktopInstance(*mut std::ffi::c_void);
impl DesktopInstance {
    fn acquire() -> Option<Self> {
        let name: Vec<u16> = "Local\\ReadyPlayerOneDesktop".encode_utf16().chain(Some(0)).collect();
        unsafe {
            let handle = CreateMutexW(std::ptr::null_mut(), 0, name.as_ptr());
            if handle.is_null() { return None; }
            if GetLastError() == 183 { CloseHandle(handle); return None; }
            Some(Self(handle))
        }
    }
}
impl Drop for DesktopInstance {
    fn drop(&mut self) { unsafe { CloseHandle(self.0); } }
}

fn backend_owned_by(pid: u32) -> bool {
    let address: SocketAddr = "127.0.0.1:8789".parse().expect("valid backend address");
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(200)) else { return false; };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    if stream.write_all(b"GET /api/health HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n").is_err() { return false; }
    let mut response = String::new();
    let _ = stream.take(16384).read_to_string(&mut response);
    response.contains("\"app\":\"ready-player-one\"")
        && response.contains(&format!("\"pid\":{},", pid))
}

fn start_backend() -> Option<Child> {
    let root = find_project_root()?;
    let bundled_node = root.join(if cfg!(windows) { "node.exe" } else { "node" });
    let node = if bundled_node.is_file() {
        bundled_node
    } else {
        PathBuf::from("node")
    };
    let mut command = Command::new(node);
    command
        .arg(root.join("ui").join("start-server.js"))
        .arg("--owned")
        .arg(format!("--parent-pid={}", std::process::id()))
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(0x08000000);
    let mut child = command.spawn().ok()?;

    for _ in 0..100 {
        if child.try_wait().ok().flatten().is_some() { return None; }
        if backend_owned_by(child.id()) { return Some(child); }
        thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let Some(_instance) = DesktopInstance::acquire() else { return; };
    let initial_backend = start_backend().expect("The current RP1 backend could not start");
    let backend = Arc::new(Mutex::new(Some(initial_backend)));
    let stop_watchdog = Arc::new(AtomicBool::new(false));
    let watchdog_backend = Arc::clone(&backend);
    let watchdog_stop = Arc::clone(&stop_watchdog);
    let watchdog = thread::spawn(move || {
        while !watchdog_stop.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_secs(2));
            if watchdog_stop.load(Ordering::Relaxed) {
                break;
            }

            let mut managed = watchdog_backend.lock().expect("backend watchdog lock");
            if let Some(child) = managed.as_mut() {
                if child.try_wait().ok().flatten().is_some() {
                    *managed = None;
                }
            }
            if managed.is_none() && !backend_is_running() {
                *managed = start_backend();
            }
        }
    });

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_embedded_display, close_embedded_display])
        .run(tauri::generate_context!())
        .expect("error while running Ready Player One");

    stop_watchdog.store(true, Ordering::Relaxed);
    let _ = watchdog.join();
    {
        let mut managed = backend.lock().expect("backend shutdown lock");
        if let Some(child) = managed.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
