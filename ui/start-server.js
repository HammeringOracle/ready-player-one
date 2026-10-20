const http = require("node:http");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { version } = require("../package.json");

const host = "127.0.0.1";
const port = 8789;
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

async function stopOutdatedRp1Backend() {
  if (process.platform !== "win32") return false;
  const pid = await findWindowsPortOwner();
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

(async () => {
  const health = await readHealthWithRetry();
  if (health?.status === 200 && health.body?.app === "ready-player-one") {
    if (health.body.version === version && health.body.sourceHash === sourceHash) {
      console.log(`Ready Player One ${version} backend is already running on http://localhost:${port}`);
      return;
    }
    console.log(`Replacing outdated Ready Player One backend ${health.body.version || "(unversioned)"} with ${version}.`);
    await stopOutdatedRp1Backend();
    await waitForBackendExit();
  } else if (health) {
    throw new Error(`Port ${port} is occupied by a program that is not Ready Player One. It was not stopped.`);
  } else if (process.platform === "win32" && await findWindowsPortOwner()) {
    // A busy RP1 backend can occasionally take longer than a health probe,
    // especially during large transfer batches. Never blindly start another
    // listener when Windows confirms that the port is already occupied.
    throw new Error(`Port ${port} is already in use and its health check did not answer. Close the existing program or wait a moment, then try again.`);
  }
  require("./server");
})().catch(error => {
  console.error(`Ready Player One backend startup failed: ${error.message}`);
  process.exitCode = 1;
});
