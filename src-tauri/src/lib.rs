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
