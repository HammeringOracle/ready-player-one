const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const requested = process.argv.slice(2);
const mode = requested[0] || "dev";
const executable = path.join(root, "src-tauri", "target", "debug", "ready-player-one.exe");
const tauriCli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");

function newestModifiedTime(target) {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return fs.readdirSync(target, { withFileTypes: true }).reduce((latest, entry) =>
    Math.max(latest, newestModifiedTime(path.join(target, entry.name))), stat.mtimeMs);
}

function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: mode === 'desktop' ? 'ignore' : 'inherit', windowsHide: true });
  child.once("error", error => {
    console.error(`Ready Player One desktop launch failed: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
  return child;
}

async function launch() {
if (mode === 'desktop') {
  const installed = path.join(root, 'Ready Player One.exe');
  run(fs.existsSync(installed) ? installed : executable, requested.slice(1));
} else if (mode !== "dev") {
  run(process.execPath, [tauriCli, ...requested]);
} else {
  const candidates = [path.join(root, 'Ready Player One.exe'), path.join(root, 'src-tauri', 'target', 'release', 'ready-player-one.exe'), executable];
  const currentExecutable = candidates.sort((left, right) => newestModifiedTime(right) - newestModifiedTime(left))[0];
  const executableTime = newestModifiedTime(currentExecutable);
  const desktopSourceTime = Math.max(
    newestModifiedTime(path.join(root, "src-tauri", "src")),
    newestModifiedTime(path.join(root, "src-tauri", "build.rs")),
    newestModifiedTime(path.join(root, "src-tauri", "tauri.conf.json")),
    newestModifiedTime(path.join(root, "src-tauri", "Cargo.toml"))
  );
  if (!executableTime || desktopSourceTime > executableTime) {
    console.log("The RP1 desktop shell changed; rebuilding it once before launch.");
    const build = run(process.execPath, [tauriCli, "build", "--no-bundle"]);
    build.once('exit', code => {
      if (code === 0) run(path.join(root, 'src-tauri', 'target', 'release', 'ready-player-one.exe'), requested.slice(1));
    });
  } else {
    console.log("Opening the current RP1 desktop build (no unnecessary Rust rebuild). ");
    run(currentExecutable, requested.slice(1));
  }
}
}
launch().catch(error => { console.error(`Ready Player One launch failed: ${error.message}`); process.exitCode = 1; });
