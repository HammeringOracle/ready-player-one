const http = require("node:http");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { version } = require("../package.json");

const host = "127.0.0.1";
const port = 8789;
const owned = process.argv.includes('--owned');
const parentArgument = process.argv.find(value => value.startsWith('--parent-pid='));
const ownerPid = parentArgument ? Number(parentArgument.split('=')[1]) : 0;
if (owned && (!Number.isInteger(ownerPid) || ownerPid <= 0)) throw new Error('Owned backend requires a desktop process ID.');
if (owned) {
  setInterval(() => {
    try { process.kill(ownerPid, 0); }
    catch (error) { if (error.code === 'ESRCH') process.exit(0); }
  }, 1000).unref();
}
const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname, "server.js"))).digest("hex");

function readHealth(timeout = 5000) {
  return new Promise(resolve => {
    const request = http.get({ hostname: host, port, path: "/api/health", timeout }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { if (body.length < 8192) body += chunk; });
      response.on("end", () => {
        try { resolve({ status: response.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: response.statusCode, body: null }); }
      });
    });
    request.on("timeout", () => { request.destroy(); resolve(null); });
    request.on("error", () => resolve(null));
  });
}

async function readHealthWithRetry() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const health = await readHealth();
    if (health) return health;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250));
  }
  return null;
}

function findWindowsPortOwner() {
  return new Promise((resolve, reject) => {
    execFile("netstat.exe", ["-ano", "-p", "tcp"], { windowsHide: true }, (error, stdout) => {
      if (error) return reject(error);
      for (const line of String(stdout).split(/\r?\n/)) {
        const columns = line.trim().split(/\s+/);
        if (columns.length >= 5 && columns[1]?.endsWith(`:${port}`) && columns[3] === "LISTENING") {
          const pid = Number(columns[4]);
          if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) return resolve(pid);
        }
      }
      resolve(0);
    });
  });
}

function isWindowsRp1Backend(pid) {
  if (process.platform !== "win32" || !Number.isInteger(pid) || pid <= 0) return Promise.resolve(false);
  const script = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' -ErrorAction SilentlyContinue;if($p -and $p.CommandLine -match '[\\\\/]ui[\\\\/]start-server\\.js(?:"|\\s|$)' -and $p.CommandLine -match 'Ready Player One'){exit 0};exit 1`;
  return new Promise(resolve => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], { windowsHide: true, timeout: 5000 }, error => resolve(!error));
  });
}

async function stopOutdatedRp1Backend(knownPid = 0) {
  if (process.platform !== "win32") return false;
  const pid = knownPid || await findWindowsPortOwner();
  if (!pid) return false;
  return new Promise((resolve, reject) => {
    // The health probe positively identified this listener as RP1 before this
    // function is called. An unknown process occupying the port is never killed.
    execFile("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, error => {
      if (error) reject(error); else resolve(true);
    });
  });
}

async function waitForBackendExit() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!await readHealth()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("The outdated Ready Player One backend did not stop.");
}

async function waitForPortRelease() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!await findWindowsPortOwner()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("The unresponsive Ready Player One backend did not release its port.");
}

(async () => {
  const health = await readHealthWithRetry();
  if (health?.status === 200 && health.body?.app === "ready-player-one") {
    if (!owned && health.body.version === version && health.body.sourceHash === sourceHash) {
      console.log(`Ready Player One ${version} backend is already running on http://localhost:${port}`);
      return;
    }
    console.log(`Replacing outdated Ready Player One backend ${health.body.version || "(unversioned)"} with ${version}.`);
    await stopOutdatedRp1Backend();
    await waitForBackendExit();
  } else if (health) {
    throw new Error(`Port ${port} is occupied by a program that is not Ready Player One. It was not stopped.`);
  } else if (process.platform === "win32") {
    const pid = await findWindowsPortOwner();
    if (pid) {
      // A crashed or blocked RP1 backend can outlive its desktop window and
      // hold the port forever. Replace it only after its Windows command line
      // positively identifies ui/start-server.js inside Ready Player One.
      // Unknown listeners remain protected.
      if (!await isWindowsRp1Backend(pid)) {
        throw new Error(`Port ${port} is occupied by another program. Ready Player One did not stop it.`);
      }
      console.log(`Replacing unresponsive Ready Player One backend process ${pid}.`);
      await stopOutdatedRp1Backend(pid);
      await waitForPortRelease();
    }
  }
  require("./server");
})().catch(error => {
  console.error(`Ready Player One backend startup failed: ${error.message}`);
  process.exitCode = 1;
});
