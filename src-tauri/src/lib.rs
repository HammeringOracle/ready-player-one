use std::{
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

fn start_backend() -> Option<Child> {
    if backend_is_running() {
        return None;
    }

    let root = find_project_root()?;
    let bundled_node = root.join(if cfg!(windows) { "node.exe" } else { "node" });
    let node = if bundled_node.is_file() {
        bundled_node
    } else {
        PathBuf::from("node")
    };
    let mut command = Command::new(node);
    command
        .arg(root.join("ui").join("server.js"))
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(0x08000000);
    let child = command.spawn().ok();

    for _ in 0..30 {
        if backend_is_running() {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    child
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend = Arc::new(Mutex::new(start_backend()));
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
        }
    }
}
