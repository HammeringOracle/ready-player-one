const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const dgram = require("node:dgram");
const os = require("node:os");
const dns = require("node:dns").promises;
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { Worker } = require("node:worker_threads");
const { Client } = require("ssh2");
// Identify the code this process loaded, not whatever is currently on disk.
// The launcher uses this hash to replace an outdated backend after edits.
const runningSourceHash = crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex");
const { readUsbLibrary } = require('./usb-library');
const { inspectSharedDualBootImage } = require('./shared-dual-boot-image');
const { stageSharedDualBootImage } = require('./shared-dual-boot-stage');
const { copyFileResumableLocal } = require('./usb-copy');
const { queueDeletion, cancelDeletion, deletionState, stageController } = require('./usb-deletions');
const cleanRomName = require('./rom-name');
const mameTitles = require('./mame-titles.json');

function displayGameTitle(system, fileName) {
  if (system === "mame") {
    const shortName = path.basename(String(fileName || ""), path.extname(String(fileName || ""))).toLowerCase();
    if (mameTitles[shortName]) return mameTitles[shortName];
  }
  return cleanRomName(fileName);
}

const uiRoot = __dirname;
const root = path.dirname(uiRoot);
const port = Number(process.env.PORT || 8789);
const sharedDualBootStageJobs = new Map();
const controllerSettingsPath = path.join(root, "controller-settings.json");
const ipac4DefaultPath = path.join(root, "ipac4-default.json");
const ipac4GeneratedPath = path.join(root, "ipac4-generated.json");
const deviceSettingsPath = path.join(root, "device-settings.json");
const scraperSettingsPath = path.join(root, "scraper-settings.json");
const machineBehaviorStatePath = path.join(root, "machine-behavior.json");
const biosCachePath = path.join(root, "bios-cache");
const ps4ModulesPath = path.join(root, "firmware", "ps4", "sys_modules");
const ps4RemoteModulesPath = "/userdata/system/configs/shadps4/sys_modules";
const requiredPs4Modules = [
  "libSceAudiodec.sprx", "libSceCesCs.sprx", "libSceFont.sprx",
  "libSceFontFt.sprx", "libSceFreeTypeOt.sprx", "libSceJpegDec.sprx",
  "libSceJpegEnc.sprx", "libSceJson.sprx", "libSceJson2.sprx",
  "libSceLibcInternal.sprx", "libSceNgs2.sprx", "libScePngEnc.sprx",
  "libSceRtc.sprx", "libSceSystemGesture.sprx", "libSceUlt.sprx"
];
const wiiUCemuSupportPath = path.join(root, "installers", "wiiu", "cemu");
const wiiUCemuSupportFiles = [
  { name: "snd_user.rpl", sha256: "45b0dbe8926a263d86bc4e77084815e58336b9b437196d48bc3da3c5b2b2675e" },
  { name: "snduser2.rpl", sha256: "ce928ad53d8497b6626ef3893cc0427c9ea36f0a63e82e2530179afa354eb15e" }
];
const wiiUBlackOpsProfileName = "000500001010cf00.ini";
const wiiUBlackOpsProfile = "# Call of Duty: Black Ops II (USA)\n[General]\nloadSharedLibraries = true\n";
const lakkaSessions=new Map();
const lakkaCredentialsPath=path.join(root,'lakka-credentials.json');
const layoutsPath = path.join(root, "Layouts");
const backupsPath = path.join(root, "Backups");
const usbImagesPath = path.join(root, "USB Images");
const transferActivityPath = path.join(root, "transfer-activity.json");
const softResetStatePath = path.join(root, "soft-reset-state.json");
const systemArtCachePath = path.join(root, "system-art-cache");
const batoceraSystemArtFolders = new Set([
  "c64",
  "mame", "nes", "snes", "megadrive", "gba", "psx", "ps2", "n64", "gb", "gbc", "nds", "3ds", "gc", "wii",
  "mastersystem", "gamegear", "segacd", "saturn", "dreamcast", "psp", "neogeo", "atari2600", "atari5200", "atari7800", "lynx", "xegs", "jaguar", "jaguarcd", "atari800", "atarist", "pcengine",
  "wiiu", "ps3", "ps4", "xbox", "xbox360", "music"
]);
const supplementalSystemArt = {
  wiiu: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Wii_U_Console_and_Gamepad.png?width=512",
  ps3: "https://commons.wikimedia.org/wiki/Special:Redirect/file/PS3-slim-console.png?width=512",
  ps4: "https://commons.wikimedia.org/wiki/Special:Redirect/file/PS4-Console-wDS4.png?width=512",
  xbox: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Xbox_console_transparent.png?width=512",
  xbox360: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Xbox360.png?width=512",
  // The bundled RP1 artwork is authoritative. This URL is used only if a
  // damaged installation is missing that bundled asset.
  music: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Vinyl_record.svg?width=512"
};
function softResetMachineIdentity(deviceName) {
  const settings = readDeviceSettings();
  const installationId = String(settings?.[deviceName]?.installationId || "").trim();
  return installationId ? `batocera-installation:${installationId}` : String(deviceName || "Batocera");
}

function readSoftResetState() {
  try {
    const value = JSON.parse(fs.readFileSync(softResetStatePath, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : { pending: {} };
  } catch { return { pending: {} }; }
}

function writeSoftResetState(state) {
  const temporary = `${softResetStatePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporary, softResetStatePath);
}

function softResetGameKey(system, fileName) {
  return JSON.stringify([String(system || ""), String(fileName || "")]);
}

function markSoftResetNeeded(deviceName, system, fileName, finishedAt = new Date().toISOString()) {
  if (!deviceName || system === "music") return;
  const state = readSoftResetState();
  state.pending ||= {};
  const identity = softResetMachineIdentity(deviceName);
  const previous = state.pending[identity] || state.pending[deviceName];
  const addedGames = new Set(Array.isArray(previous?.addedGames) ? previous.addedGames : []);
  addedGames.add(softResetGameKey(system, fileName));
  state.pending[identity] = { device: deviceName, finishedAt, addedGames: [...addedGames] };
  if (identity !== deviceName) delete state.pending[deviceName];
  writeSoftResetState(state);
}

function clearSoftResetNeededForGame(deviceName, system, fileName) {
  const state = readSoftResetState();
  state.pending ||= {};
  const identities = [...new Set([softResetMachineIdentity(deviceName), deviceName].filter(Boolean))];
  const gameKey = softResetGameKey(system, fileName);
  for (const identity of identities) {
    const entry = state.pending[identity];
    if (!entry) continue;
    // Entries from an older backend tracked only the most recent system. A
    // matching deletion cancels that legacy attention flag as well.
    if (!Array.isArray(entry.addedGames)) {
      if (!entry.system || entry.system === system) delete state.pending[identity];
      continue;
    }
    entry.addedGames = entry.addedGames.filter(value => value !== gameKey);
    if (entry.addedGames.length) state.pending[identity] = entry;
    else delete state.pending[identity];
  }
  writeSoftResetState(state);
}

function clearSoftResetNeeded(deviceName) {
  const state = readSoftResetState();
  state.pending ||= {};
  delete state.pending[softResetMachineIdentity(deviceName)];
  delete state.pending[deviceName];
  writeSoftResetState(state);
}

function isSoftResetNeeded(deviceName) {
  const pending = readSoftResetState().pending || {};
  const entry = pending[softResetMachineIdentity(deviceName)] || pending[deviceName];
  // Pending uploads survive RP1 restarts. Only a successful machine refresh
  // clears this state, so newly copied games remain yellow until Soft Reset.
  return Boolean(entry && Array.isArray(entry.addedGames) && entry.addedGames.length);
}

function softResetPendingGames(deviceName, system) {
  const pending = readSoftResetState().pending || {};
  const entry = pending[softResetMachineIdentity(deviceName)] || pending[deviceName];
  if (!entry || !Array.isArray(entry.addedGames)) return [];
  const names = [];
  for (const encoded of entry.addedGames) {
    try {
      const [entrySystem, fileName] = JSON.parse(encoded);
      if (entrySystem === system && fileName) names.push(fileName);
    } catch {}
  }
  return names;
}
const retroBatDiscovery = require('./retrobat-discovery').createDiscovery({
  settingsPath: path.join(root, 'retrobat-machines.json'), getHosts: getLocalScanHosts,
  arpEntries, isOnLan: isAddressOnActiveLan, portOpen: isTcpPortOpen,
  ping: canPing,
  hostName: netbiosName,
  inspectSsh: async host => {
    let known={},saved={};
    try{known=JSON.parse(fs.readFileSync(path.join(root,'retrobat-machines.json'),'utf8'));}catch{}
    try{saved=JSON.parse(fs.readFileSync(lakkaCredentialsPath,'utf8'));}catch{}
    const match=Object.entries(known).find(([,m])=>m.host===host&&['lakka','recalbox'].includes(m.platform));
    if(!match)return null;
    let credentials=lakkaSessions.get(match[0]);
    const entry=saved[match[0]];
    if(!credentials&&entry?.passwordProtected)credentials={user:entry.user,password:require('./machine-secret')('Unprotect',entry.passwordProtected)};
    if(!credentials)return null;
    const output=await execSsh({host,...credentials},'cat /etc/os-release; printf "\\nRECROOM_HOST="; hostname',6000);
    const expected=match[1].platform;
    if(expected==='lakka'&&!/^ID=["']?lakka["']?\s*$/im.test(output))return null;
    if(expected==='recalbox'&&!/(?:^ID=["']?recalbox["']?\s*$|^RECROOM_HOST=recalbox\s*$)/im.test(output))return null;
    const name=output.match(/^RECROOM_HOST=([\w .-]+)$/m)?.[1];
    return {found:true,platform:expected,verifiedSsh:true,displayName:name,libraryAccessible:true};
  }
});

// Ready Player Two announces only the machine name and the supported Windows
// frontends it configured. This lets RP1 identify a password-protected SMB PC
// without weakening the share or broadcasting credentials.
const rp2Announcements=dgram.createSocket('udp4');
rp2Announcements.on('message',(message,remote)=>{
  try{
    const notice=JSON.parse(message.toString('utf8'));
    if(notice?.kind!=='ready-player-two'||![1,2].includes(notice.version)||!Array.isArray(notice.platforms)||!isAddressOnActiveLan(remote.address))return;
    retroBatDiscovery.announceWindows(remote.address,notice.computer,notice.account);
    for(const platform of notice.platforms)retroBatDiscovery.announce(remote.address,String(platform),notice.computer,notice.account);
    fastDeviceStatusCache.at=0;
    if (notice.platforms.length) retroBatDiscovery.scan().catch(error=>console.error('RP2 announcement scan failed:',error));
  }catch{}
});
rp2Announcements.on('error',error=>console.error('RP2 announcement listener failed:',error.message));
rp2Announcements.bind(8790);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf"
};

const batoceraAliases = [
      "batocera",
      "batocera.local",
      "batocera.lan",
      "batocera4",
      "batocera4.local",
      "raspberrypi",
      "raspberrypi.local",
      "retropie",
      "retropie.local",
      "retropie.lan",
      "recalbox",
      "recalbox.local",
      "recalbox.lan"
];

function newBatoceraDevice(host = null, mac = "") {
  return {
    host: host === null ? "batocera" : host,
    aliases: batoceraAliases,
    user: "",
    password: "",
    discoveredHost: host,
    mac: String(mac || "").toLowerCase()
  };
}

// Persisted machine settings are the source of truth. A fresh installation
// starts empty; discovery or Add Machine creates the first Batocera slot.
const devices = {};

let discoveryCache = { at: 0, devices: null };
let fastDeviceStatusCache = { at: 0, devices: null };
let discoveryNetworkSignature = "";
let usbDiscoveryCache = { at: 0, devices: [] };
const verifiedOnlineUntil = new Map();
let lastScanCandidates = [];
let deepDiscoveryPromise = null;
let fullSubnetScanRequested = true;
let lastFullSubnetScanAt = 0;
const fullSubnetScanIntervalMs = 15 * 60 * 1000;
let lastAutomaticRediscoveryAt = 0;
const automaticRediscoveryIntervalMs = 60 * 1000;
const automaticFullSubnetIntervalMs = 2 * 60 * 1000;
let musicScrapeJob = {
  running: false,
  total: 0,
  processed: 0,
  matched: 0,
  artwork: 0,
  skipped: 0,
  errors: [],
  current: "",
  finishedAt: ""
};
let consoleScrapeJob = {
  running: false, cancelled: false, total: 0, processed: 0, matched: 0,
  artwork: 0, skipped: 0, systemsCompleted: 0, errors: [], current: "", finishedAt: ""
};
const consoleScrapeStatusPath = path.join(root, 'console-scrape-status.json');
try {
  const saved = JSON.parse(fs.readFileSync(consoleScrapeStatusPath, 'utf8'));
  if (saved && Array.isArray(saved.errors)) {
    consoleScrapeJob = { ...consoleScrapeJob, ...saved, running: false };
    if (saved.running) consoleScrapeJob.errors.push('Scraping was interrupted when Warehouse stopped. Start scraping again to continue missing artwork.');
  }
} catch {}
function persistConsoleScrapeJob() {
  const temporary = `${consoleScrapeStatusPath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(consoleScrapeJob, null, 2));
  fs.renameSync(temporary, consoleScrapeStatusPath);
}
function readTransferJobs() {
  try {
    const saved = JSON.parse(fs.readFileSync(transferActivityPath, "utf8"));
    if (!Array.isArray(saved)) return [];
    const deviceSettings = readDeviceSettings();
    return saved.map(job => {
      if (!job || !job.device || !job.system || !job.fileName) return null;
      const currentInstallation = String(deviceSettings[job.device]?.installationId || "").trim();
      // Legacy jobs have no installation identity. Once a Batocera image has
      // been identified, they cannot safely be replayed or displayed there.
      if (currentInstallation && job.installationId !== currentInstallation) return null;
      // Repair queues written by older frontends that let the currently viewed
      // console leak into an already-running bulk transfer. These extensions
      // are SNES-only in RP1, so they can never be valid GameCube (or other
      // system) jobs. If the local SNES source was subsequently removed, drop
      // the dead activity record instead of briefly rendering it as an upload.
      const misplacedSnes = job.system !== "snes" && /\.(?:smc|sfc|fig|swc)$/i.test(job.fileName);
      if (misplacedSnes) {
        if (!fs.existsSync(path.join(root, "roms", "snes", job.fileName))) return null;
        job = { ...job, system: "snes", error: job.completed ? job.error : "Transfer restored to its original SNES queue." };
      }
      if (job.running) {
        const wasStopping = Boolean(job.cancelRequested);
        return {
          ...job,
          running: false,
          dispatching: false,
          completed: false,
          cancelled: wasStopping,
          autoQueued: !wasStopping,
          queuedAt: wasStopping ? "" : (job.queuedAt || new Date().toISOString()),
          percent: Math.min(99.9, Number(job.percent || 0)),
          error: wasStopping ? "Transfer stopped by user." : "Transfer interrupted when Ready Player One closed. Resuming automatically."
        };
      }
      // A loopback request cannot remain in flight across a backend restart.
      // Clear its transient hand-off flag so the durable queue may resume it.
      return job.dispatching ? { ...job, dispatching: false } : job;
    }).filter(Boolean);
  } catch {
    return [];
  }
}

const transferJobs = new Map(readTransferJobs().map(job => [JSON.stringify([job.device, job.system, job.fileName]), job]));
const activeUploadCancels = new Map();
// Completed transfer history is display-only; retaining thousands of old rows
// made every queue watchdog pass and persistence update needlessly expensive.
// Preserve every unfinished job and only the newest completed records.
const completedTransferHistory = [...transferJobs.entries()]
  .filter(([, job]) => job.completed)
  .sort((left, right) => Date.parse(right[1].finishedAt || 0) - Date.parse(left[1].finishedAt || 0));
for (const [key] of completedTransferHistory.slice(200)) transferJobs.delete(key);
const removalJobs = new Map();
const gamelistUpdateLocks = new Map();
let transferPersistTimer = null;
function persistTransferJobs() {
  fs.writeFileSync(transferActivityPath, `${JSON.stringify([...transferJobs.values()])}\n`, "utf8");
}
function scheduleTransferPersistence(immediate = false) {
  if (transferPersistTimer) clearTimeout(transferPersistTimer);
  if (immediate) {
    transferPersistTimer = null;
    persistTransferJobs();
    return;
  }
  transferPersistTimer = setTimeout(() => {
    transferPersistTimer = null;
    persistTransferJobs();
  }, 500);
}

async function withGamelistUpdateLock(key, operation) {
  const previous = gamelistUpdateLocks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  gamelistUpdateLocks.set(key, current);
  try {
    return await current;
  } finally {
    if (gamelistUpdateLocks.get(key) === current) gamelistUpdateLocks.delete(key);
  }
}

const systemFolders = {
  c64: "c64",
  steam: "steam",
  ports: "ports", pygame: "pygame", windows: "windows",
  mame: "mame",
  nes: "nes",
  "3dsen": "3dsen",
  pikaraoke: "pikaraoke",
  snes: "snes",
  sega: "megadrive",
  gba: "gba",
  ps1: "psx",
  ps2: "ps2",
  ps3: "ps3",
  ps4: "ps4",
  n64: "n64",
  gb: "gb",
  gbc: "gbc",
  nds: "nds",
  "3ds": "n3ds",
  gamecube: "gamecube",
  wii: "wii",
  wiiu: "wiiu",
  switch: "switch",
  mastersystem: "mastersystem",
  gamegear: "gamegear",
  segacd: "segacd",
  saturn: "saturn",
  dreamcast: "dreamcast",
  psp: "psp",
  psvita: "psvita",
  xbox: "xbox",
  xbox360: "xbox360",
  neogeo: "neogeo",
  atari2600: "atari2600",
  atari5200: "atari5200",
  atari7800: "atari7800",
  atarilynx: "lynx",
  xegs: "xegs",
  jaguar: "jaguar",
  jaguarcd: "jaguarcd",
  atari800: "atari800",
  atarist: "atarist",
  pcengine: "pcengine",
  dos: "dos",
  karaoke: "karaoke",
  music: "music"
};

const localFolders = {
  c64: "c64",
  steam: "steam",
  ports: "ports", pygame: "pygame", windows: "windows",
  mame: "mame",
  nes: "nes",
  "3dsen": "nes",
  pikaraoke: "pikaraoke",
  snes: "snes",
  sega: "megadrive",
  gba: "gba",
  ps1: "psx",
  ps2: "ps2",
  ps3: "ps3",
  ps4: "ps4",
  n64: "n64",
  gb: "gb",
  gbc: "gbc",
  nds: "nds",
  "3ds": "3ds",
  gamecube: "gamecube",
  wii: "wii",
  wiiu: "wiiu",
  switch: "switch",
  mastersystem: "mastersystem",
  gamegear: "gamegear",
  segacd: "segacd",
  saturn: "saturn",
  dreamcast: "dreamcast",
  psp: "psp",
  psvita: "psvita",
  xbox: "xbox",
  xbox360: "xbox360",
  neogeo: "neogeo",
  atari2600: "atari2600",
  atari5200: "atari5200",
  atari7800: "atari7800",
  atarilynx: "atarilynx",
  xegs: "xegs",
  jaguar: "jaguar",
  jaguarcd: "jaguarcd",
  atari800: "atari800",
  atarist: "atarist",
  pcengine: "pcengine",
  dos: "dos",
  karaoke: "karaoke",
  music: "music"
};

// Stable system IDs keep older saved layouts compatible; only PC paths move.
for (const system of Object.keys(localFolders)) {
  if (!["music", "karaoke"].includes(system)) localFolders[system] = `roms/${localFolders[system]}`;
}

const systemLabels = {
  c64: "Commodore 64",
  steam: "Steam",
  ports: "Ports", pygame: "Pygame", windows: "Windows (Wine)",
  mame: "MAME",
  nes: "NES",
  "3dsen": "3dSen",
  pikaraoke: "PiKaraoke",
  snes: "SNES",
  sega: "Mega Drive",
  gba: "GBA",
  ps1: "PS1",
  ps2: "PS2",
  ps3: "PS3",
  ps4: "PS4",
  n64: "N64",
  gb: "Game Boy",
  gbc: "Game Boy Color",
  nds: "Nintendo DS",
  "3ds": "Nintendo 3DS",
  gamecube: "GameCube",
  wii: "Wii",
  wiiu: "Wii U",
  switch: "Switch",
  mastersystem: "Master System",
  gamegear: "Game Gear",
  segacd: "Sega CD",
  saturn: "Sega Saturn",
  dreamcast: "Dreamcast",
  psp: "PSP",
  psvita: "PS Vita",
  xbox: "Xbox",
  xbox360: "Xbox 360",
  neogeo: "Neo Geo",
  atari2600: "Atari 2600",
  atari5200: "Atari 5200",
  atari7800: "Atari 7800",
  atarilynx: "Atari Lynx",
  xegs: "Atari XEGS",
  jaguar: "Atari Jaguar",
  jaguarcd: "Atari Jaguar CD",
  atari800: "Atari 400/800/XL/XE",
  atarist: "Atari ST/STE/TT/Falcon",
  pcengine: "PC Engine",
  dos: "DOS",
  karaoke: "Karaoke",
  music: "MP3/FLAC"
};

const localExtensions = {
  c64: [".d64", ".d81", ".crt", ".prg", ".tap", ".t64", ".m3u", ".zip", ".7z"],
  steam: [".steam"],
  ports: [".sh"], pygame: [".pygame"], windows: [".pc", ".exe", ".msi", ".iso", ".wine", ".wsquashfs", ".wtgz"],
  mame: [".zip", ".7z"],
  nes: [".nes", ".zip", ".7z"],
  "3dsen": [".nes", ".zip", ".7z"],
  pikaraoke: [".sh"],
  snes: [".smc", ".sfc", ".zip", ".7z"],
  sega: [".bin", ".gen", ".md", ".smd", ".zip", ".7z"],
  gba: [".gba", ".zip", ".7z"],
  ps1: [".chd", ".cue", ".iso", ".bin", ".pbp", ".m3u"],
  ps2: [".iso", ".mdf", ".nrg", ".bin", ".img", ".dump", ".gz", ".cso", ".chd"],
  ps3: [".ps3", ".psn", ".squashfs"],
  ps4: [".ps4", ".zar"],
  n64: [".z64", ".n64", ".v64", ".zip", ".7z"],
  gb: [".gb", ".zip", ".7z"],
  gbc: [".gbc", ".zip", ".7z"],
  nds: [".nds", ".zip", ".7z"],
  "3ds": [".3ds", ".3dsx", ".cia", ".cci", ".cxi", ".app"],
  gamecube: [".iso", ".gcm", ".gcz", ".rvz", ".wia", ".wbfs", ".ciso", ".dol", ".elf", ".m3u", ".json"],
  wii: [".iso", ".gcz", ".rvz", ".wia", ".wbfs", ".ciso", ".wad", ".dol", ".elf", ".m3u", ".json"],
  wiiu: [".wua", ".wux", ".wud", ".rpx"],
  switch: [".nsp", ".xci", ".nro", ".nca"],
  mastersystem: [".sms", ".bin", ".zip", ".7z"],
  gamegear: [".gg", ".bin", ".zip", ".7z"],
  segacd: [".cue", ".iso", ".chd", ".m3u"],
  saturn: [".cue", ".iso", ".chd", ".m3u"],
  dreamcast: [".cdi", ".cue", ".gdi", ".chd", ".m3u"],
  psp: [".iso", ".cso", ".pbp", ".chd"],
  psvita: [".vpk", ".psvita"],
  xbox: [".iso", ".xiso", ".squashfs"],
  xbox360: [".iso", ".xex", ".xbox360"],
  neogeo: [".zip", ".7z"],
  atari2600: [".a26", ".bin", ".zip", ".7z"],
  atari5200: [".a52", ".bin", ".rom", ".zip", ".7z"],
  atari7800: [".a78", ".bin", ".zip", ".7z"],
  atarilynx: [".lnx", ".lyx", ".o", ".zip", ".7z"],
  xegs: [".atr", ".dsk", ".xfd", ".bin", ".rom", ".car", ".zip", ".7z"],
  jaguar: [".j64", ".jag", ".rom", ".abs", ".cof", ".bin", ".prg", ".zip", ".7z"],
  jaguarcd: [".cue", ".cdi", ".chd", ".jcd", ".zip", ".7z"],
  atari800: [".atr", ".atx", ".dsk", ".xfd", ".bin", ".rom", ".car", ".cas", ".xex", ".com", ".zip", ".7z"],
  atarist: [".st", ".msa", ".stx", ".dim", ".ipf", ".m3u", ".zip", ".7z"],
  pcengine: [".pce", ".cue", ".chd", ".zip", ".7z"],
  dos: [".pc", ".dos", ".zip", ".7z"],
  karaoke: [".cdg"],
  music: [".mp3", ".flac"]
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readControllerSettings() {
  try {
    return JSON.parse(fs.readFileSync(controllerSettingsPath, "utf8"));
  } catch {
    return {};
  }
}

function writeControllerSettings(settings) {
  fs.writeFileSync(controllerSettingsPath, JSON.stringify(settings, null, 2));
}

function readDeviceSettings() {
  try {
    return JSON.parse(fs.readFileSync(deviceSettingsPath, "utf8"));
  } catch {
    return {};
  }
}

function writeDeviceSettings(settings) {
  fs.writeFileSync(deviceSettingsPath, JSON.stringify(settings, null, 2));
}

function loadDeviceSettings() {
  const settings = readDeviceSettings();
  Object.entries(settings).forEach(([name, config]) => {
    if (!config || !/^Batocera(?: \d+)?$/i.test(name)) {
      return;
    }

    if (!devices[name]) devices[name] = newBatoceraDevice(config.discoveredHost || config.host || "", config.mac || "");

    if (config.host) {
      devices[name].host = config.host;
    }
    if (config.discoveredHost) {
      devices[name].discoveredHost = config.discoveredHost;
    }
    if (config.discoveredAccess) {
      devices[name].discoveredAccess = config.discoveredAccess;
    }
    if (config.mac) devices[name].mac = String(config.mac).toLowerCase();
    if (config.sshUsername && config.sshPasswordProtected) {
      try {
        devices[name].password = require('./machine-secret')('Unprotect',config.sshPasswordProtected);
        devices[name].user = config.sshUsername;
      } catch { /* Manual re-entry required under a different Windows account. */ }
    }
  });
}

loadDeviceSettings();

function isTcpPortOpen(host, port, timeoutMs = 900) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let settled = false;
    let result = false;

    const finish = value => {
      if (settled) {
        return;
      }
      settled = true;
      result = value;
      socket.destroy();
    };

    // Do not launch the next probe until Windows has actually closed this socket.
    // Resolving immediately after destroy() allowed thousands of closing sockets
    // to accumulate during repeated subnet scans and starve the local web UI.
    socket.once("close", () => resolve(result));
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

function canPing(host, timeoutMs = 900) {
  return new Promise(resolve => {
    const args = process.platform === "win32"
      ? ["-n", "1", "-w", String(timeoutMs), host]
      : process.platform === "darwin"
        ? ["-c", "1", "-W", String(timeoutMs), host]
        : ["-c", "1", "-W", String(Math.max(1, Math.ceil(timeoutMs / 1000))), host];
    execFile("ping", args, { timeout: timeoutMs + 500 }, (error, stdout) => {
      if (error) {
        resolve(false);
        return;
      }

      resolve(/TTL=/i.test(stdout) || /bytes=/i.test(stdout));
    });
  });
}

function execFileText(file, args, timeoutMs = 1200) {
  return new Promise(resolve => {
    execFile(file, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      resolve(error ? "" : `${stdout || ""}${stderr || ""}`);
    });
  });
}

function powershellSingleQuoted(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function chooseTransferLayoutPath(mode = "save") {
  const opening = mode === "open";
  fs.mkdirSync(layoutsPath, { recursive: true });
  if (process.platform !== "win32") {
    const title = opening ? "Open Ready Player One Layout" : "Save Ready Player One Layout As";
    if (process.platform === "darwin") {
      const script = opening
        ? `POSIX path of (choose file with prompt ${JSON.stringify(title)} default location POSIX file ${JSON.stringify(`${layoutsPath}${path.sep}`)})`
        : `POSIX path of (choose file name with prompt ${JSON.stringify(title)} default location POSIX file ${JSON.stringify(`${layoutsPath}${path.sep}`)} default name "Ready Player One Layout.json")`;
      return new Promise((resolve, reject) => execFile("osascript", ["-e", script], (error, stdout, stderr) => error ? reject(new Error(String(stderr || error.message).trim())) : resolve(String(stdout).trim())));
    }
    const args = ["--file-selection", `--title=${title}`, `--filename=${path.join(layoutsPath, opening ? "" : "Ready Player One Layout.json")}`];
    if (!opening) args.push("--save", "--confirm-overwrite");
    return new Promise((resolve, reject) => execFile("zenity", args, (error, stdout, stderr) => error ? reject(new Error(String(stderr || "Install zenity to use the layout file picker.").trim())) : resolve(String(stdout).trim())));
  }
  const initialDirectory = powershellSingleQuoted(layoutsPath);
  const command = [
    "Add-Type -AssemblyName System.Windows.Forms",
    `$dialog = New-Object System.Windows.Forms.${opening ? "OpenFileDialog" : "SaveFileDialog"}`,
    `$dialog.Title = '${opening ? "Open Ready Player One Layout" : "Save Ready Player One Layout As"}'`,
    "$dialog.Filter = 'JSON layout (*.json)|*.json|All files (*.*)|*.*'",
    "$dialog.DefaultExt = 'json'",
    "$dialog.AddExtension = $true",
    ...(opening ? ["$dialog.CheckFileExists = $true", "$dialog.Multiselect = $false"] : ["$dialog.OverwritePrompt = $true", "$dialog.FileName = 'Ready Player One Layout.json'"]),
    `$dialog.InitialDirectory = ${initialDirectory}`,
    "$owner = New-Object System.Windows.Forms.Form",
    "$owner.ShowInTaskbar = $false",
    "$owner.TopMost = $true",
    "$owner.StartPosition = 'CenterScreen'",
    "$owner.Size = New-Object System.Drawing.Size(1, 1)",
    "$owner.Opacity = 0",
    "$owner.Show()",
    "$owner.Activate()",
    "$result = $dialog.ShowDialog($owner)",
    "$owner.Close()",
    "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }"
  ].join("; ");
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-STA", "-Command", command], { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || error.message || "Layout dialog failed.").trim()));
        return;
      }
      resolve(String(stdout || "").trim());
    });
  });
}

function chooseSharedDualBootImage() {
  if (process.platform !== "win32") throw new Error("Choose Image is available on the Windows RP1 computer.");
  const command = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
    "$dialog.Title = 'Choose Batocera 43.1 Image'",
    "$dialog.Filter = 'Batocera images (*.img.gz;*.img)|*.img.gz;*.img'",
    "$dialog.CheckFileExists = $true",
    "$dialog.Multiselect = $false",
    `$dialog.InitialDirectory = ${powershellSingleQuoted(root)}`,
    "$dialog.FileName = 'batocera-x86_64-43.1-20260529.img.gz'",
    "$owner = New-Object System.Windows.Forms.Form",
    "$owner.ShowInTaskbar = $false",
    "$owner.TopMost = $true",
    "$owner.StartPosition = 'CenterScreen'",
    "$owner.Size = New-Object System.Drawing.Size(1, 1)",
    "$owner.Opacity = 0",
    "$owner.Show()",
    "$owner.Activate()",
    "$result = $dialog.ShowDialog($owner)",
    "$owner.Close()",
    "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }"
  ].join("; ");
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-STA", "-Command", command], { windowsHide: true }, (error, stdout, stderr) => {
      if (error) return reject(new Error(String(stderr || error.message || "Image dialog failed.").trim()));
      resolve(String(stdout || "").trim());
    });
  });
}

async function testWindowsPath(targetPath, timeoutMs = 2500) {
  const command = `if (Test-Path -LiteralPath ${powershellSingleQuoted(targetPath)}) { 'OK' }`;
  const output = await execFileText("powershell", ["-NoProfile", "-Command", command], timeoutMs);
  return /\bOK\b/.test(output);
}

async function arpEntries() {
  const output = await execFileText("arp", ["-a"], 1500);
  const entries = [];
  output.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f-]{17})\s+dynamic/i);
    if (match) {
      entries.push({ host: match[1], mac: match[2].toLowerCase() });
    }
  });
  return entries;
}

let usbDiscoveryInFlight = null;
function accessibleCachedUsbDevices() {
  return usbDiscoveryCache.devices.filter(device =>
    fs.existsSync(path.win32.join(device.driveRoot, "batocera-boot.conf")) ||
    fs.existsSync(path.win32.join(device.driveRoot, "boot", "batocera")) ||
    (device.dataRoot && fs.existsSync(path.win32.join(device.dataRoot, "roms"))));
}
async function detectBatoceraUsbDevices({ fresh = false } = {}) {
  // All callers share a scan; library/status/storage requests must not launch
  // competing CIM queries. Even fresh requests reuse a very recent scan.
  if (Date.now() - usbDiscoveryCache.at < (fresh ? 2000 : 5000)) return accessibleCachedUsbDevices();
  if (usbDiscoveryInFlight) return usbDiscoveryInFlight;
  usbDiscoveryInFlight = scanBatoceraUsbDevices().finally(() => { usbDiscoveryInFlight = null; });
  return usbDiscoveryInFlight;
}
async function scanBatoceraUsbDevices() {
  if (process.platform !== "win32") {
    usbDiscoveryCache = {at: Date.now(), devices: []};
    return [];
  }
  const command = "$items = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DeviceID -and ($_.DriveType -eq 2 -or $_.VolumeName -match 'BATOCERA|SHARE') } | ForEach-Object { $volume = $_; $diskSize = 0; try { $letter = $volume.DeviceID.TrimEnd(':'); $diskSize = (Get-Partition -DriveLetter $letter | Get-Disk).Size } catch {}; [pscustomobject]@{ DeviceID=$volume.DeviceID; VolumeName=$volume.VolumeName; FileSystem=$volume.FileSystem; Size=$volume.Size; FreeSpace=$volume.FreeSpace; DiskSize=$diskSize } }; $items | ConvertTo-Json -Compress";
  const output = await execFileText("powershell", ["-NoProfile", "-Command", command], 15000);
  // execFileText returns an empty string on failure. This is not proof of
  // removal: retain only devices whose Batocera files are still accessible.
  if (!output.trim()) {
    usbDiscoveryCache = { at: Date.now(), devices: accessibleCachedUsbDevices() };
    return usbDiscoveryCache.devices;
  }
  let volumes = [];
  try {
    const parsed = JSON.parse(output || "[]");
    volumes = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  } catch {
    usbDiscoveryCache = { at: Date.now(), devices: accessibleCachedUsbDevices() };
    return usbDiscoveryCache.devices;
  }

  const detected = [];
  for (const volume of volumes) {
    const drive = String(volume.DeviceID || "").toUpperCase();
    if (!/^[A-Z]:$/.test(drive)) continue;
    const driveRoot = `${drive}\\`;
    const label = String(volume.VolumeName || "");
    const hasBootMarker = fs.existsSync(path.win32.join(driveRoot, "batocera-boot.conf")) || fs.existsSync(path.win32.join(driveRoot, "boot", "batocera"));
    const directRoot = fs.existsSync(path.win32.join(driveRoot, "roms"))
      ? driveRoot
      : fs.existsSync(path.win32.join(driveRoot, "share", "roms"))
        ? path.win32.join(driveRoot, "share")
        : "";
    if (!hasBootMarker && !directRoot && !/BATOCERA|SHARE/i.test(label)) continue;
    const mode = directRoot ? "direct" : "staged";
    const usbDevice = {
      name: `Batocera USB (${drive})`,
      host: drive,
      drive,
      driveRoot,
      dataRoot: directRoot,
      access: "usb",
      usb: true,
      usbMode: mode,
      platform: "batocera-usb",
      label: label || "BATOCERA",
      fileSystem: String(volume.FileSystem || ""),
      size: Number(volume.Size || 0),
      freeSpace: Number(volume.FreeSpace || 0),
      physicalSize: Number(volume.DiskSize || volume.Size || 0)
    };
    detected.push(usbDevice);
  }
  usbDiscoveryCache = { at: Date.now(), devices: detected };
  return detected;
}

function ipToInt(ip) {
  return ip.split(".").reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
}

function intToIp(value) {
  return [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join(".");
}

function activeLanNetworks() {
  const networks = [];
  Object.entries(os.networkInterfaces()).forEach(([adapterName, addresses]) => (addresses || []).forEach(info => {
    if (!info || info.family !== "IPv4" || info.internal || !isPrivateLanAddress(info.address) ||
        isIgnoredScanAddress(info.address, adapterName)) {
      return;
    }
    const prefix = Math.min(Number(info.cidr?.split("/")[1] || 24), 24);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    networks.push({ address: info.address, mask, network: ipToInt(info.address) & mask });
  }));
  return networks;
}

function isAddressOnActiveLan(address) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(address || ""))) {
    return false;
  }
  const value = ipToInt(address);
  return activeLanNetworks().some(item => (value & item.mask) === item.network);
}

async function getLocalScanHosts(preferredHost = "") {
  const hosts = new Set();
  const nets = os.networkInterfaces();
  const addSubnet = prefix => {
    if (!prefix || isIgnoredScanAddress(`${prefix}.1`, "")) {
      return;
    }
    for (let last = 1; last <= 254; last += 1) {
      hosts.add(`${prefix}.${last}`);
    }
  };

  Object.entries(nets).forEach(([adapterName, addresses]) => addresses.forEach(info => {
    if (!info || info.family !== "IPv4" || info.internal) {
      return;
    }

    const address = info.address;
    if (!address || address.startsWith("169.254.")) {
      return;
    }

    if (isIgnoredScanAddress(address, adapterName)) {
      return;
    }

    if (!isPrivateLanAddress(address)) {
      return;
    }

    const prefix = Math.min(Number(info.cidr?.split("/")[1] || 24), 24);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = ipToInt(address) & mask;
    const broadcast = network | (~mask >>> 0);
    for (let value = network + 1; value < broadcast; value += 1) {
      const host = intToIp(value >>> 0);
      if (host !== address) {
        hosts.add(host);
      }
    }
  }));

  if (isAddressOnActiveLan(preferredHost)) {
    addSubnet(preferredHost.split(".").slice(0, 3).join("."));
  }

  (await arpEntries()).forEach(entry => {
    const parts = entry.host.split(".");
    if (parts.length !== 4 || entry.host.endsWith(".255") || !isAddressOnActiveLan(entry.host)) {
      return;
    }

    hosts.add(entry.host);
    const prefix = parts.slice(0, 3).join(".");
    if (isPrivateLanAddress(entry.host) && !isIgnoredScanAddress(entry.host, "")) {
      addSubnet(prefix);
    }
  });

  return [...hosts];
}

function isPrivateLanAddress(address) {
  return /^10\./.test(address) || /^192\.168\./.test(address) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(address);
}

function isIgnoredScanAddress(address, adapterName) {
  const name = String(adapterName || "").toLowerCase();
  if (/vpn|nord|tap|tunnel|tailscale|virtualbox|vethernet|vmware/.test(name)) {
    return true;
  }

  return false;
}

function localIpv4Addresses() {
  const addresses = new Set();
  Object.values(os.networkInterfaces()).forEach(items => (items || []).forEach(info => {
    if (info?.family === "IPv4" && !info.internal) {
      addresses.add(info.address);
    }
  }));
  return addresses;
}

function isLikelyInfrastructureCandidate(candidate) {
  const host = candidate?.host || "";
  const name = String(candidate?.name || candidate?.identity || "").toLowerCase();
  if (!host) {
    return true;
  }

  if (localIpv4Addresses().has(host) || /\.1$/.test(host)) {
    return true;
  }

  return /router|rax|gateway|iphone|samsung|desktop|laptop|nas|printer|hp|webos|tv|f5688w/.test(name);
}

function likelyBatoceraCandidate(candidates) {
  const possible = candidates.filter(candidate => candidate.online && !isLikelyInfrastructureCandidate(candidate));
  const hasNamedUnknown = possible.some(candidate => String(candidate.name || candidate.identity || "").trim());
  const sorted = possible
    .filter(candidate => !hasNamedUnknown || String(candidate.name || candidate.identity || "").trim())
    .sort((left, right) => {
      const serviceScore = candidate => (
        Number(candidate.checks?.ssh) * 8 +
        Number(candidate.checks?.smb) * 6 +
        Number(candidate.checks?.web) * 4 +
        Number(candidate.checks?.ping) +
        (String(candidate.name || candidate.identity || "").trim() ? 2 : 0)
      );
      return serviceScore(right) - serviceScore(left);
    });
  return sorted[0] || null;
}

async function reverseName(host) {
  try {
    return (await dns.reverse(host)).join(" ");
  } catch {
    return "";
  }
}

async function netbiosName(host, timeoutMs = 2000) {
  // A sleeping or freshly rebooted machine can leave nbtstat waiting for many
  // seconds. Use reverse DNS as a parallel identity source: Recalbox normally
  // advertises RECALBOX.lan even when its NetBIOS reply is slow.
  const [netbios, reverse] = await Promise.allSettled([
    execFileText("nbtstat", ["-A", host], timeoutMs),
    dns.reverse(host)
  ]);
  const output = netbios.status === "fulfilled" ? netbios.value : "";
  const dnsNames = reverse.status === "fulfilled" ? reverse.value.join("\n") : "";
  return [output, dnsNames].filter(Boolean).join("\n");
}

function batoceraDisplayNameFromIdentity(identity) {
  const text = String(identity || "");
  const netbios = text.match(/^\s*([^\r\n<>]{1,63}?)\s+<00>\s+UNIQUE\b/im)?.[1]?.trim();
  if (netbios && /^[\p{L}\p{N} ._-]{1,63}$/u.test(netbios)) return netbios;
  const dnsName = text.match(/\b(BATOCERA(?:[ _-]?\d+)?)\.lan\b/i)?.[1];
  return dnsName && /^[\p{L}\p{N}._-]{1,63}$/u.test(dnsName) ? dnsName : "";
}

function saveMachineDisplayName(id, identity) {
  let displayName = batoceraDisplayNameFromIdentity(identity);
  if (!displayName) return;
  const settings = readDeviceSettings();
  const installationName = String(settings[id]?.installationDisplayName || "").trim();
  // Network aliases can lag behind a renamed or re-imaged Batocera install.
  // Only the live SSH hostname check may replace a verified installation name.
  if (settings[id]?.installationId && installationName && displayName !== installationName) return;
  // NetBIOS/reverse-DNS can briefly answer with the generic BATOCERA alias.
  // Never let that fallback replace a hostname verified from the live install.
  if (/^batocera$/i.test(displayName) && installationName && !/^batocera$/i.test(installationName)) {
    displayName = installationName;
  }
  if (!settings[id] || settings[id].machineDisplayName === displayName) return;
  settings[id] = { ...settings[id], machineDisplayName: displayName };
  writeDeviceSettings(settings);
}

function savedMachineDisplayName(config, fallback) {
  const displayName = String(config?.machineDisplayName || "").trim();
  const installationName = String(config?.installationDisplayName || "").trim();
  if ((!displayName || /^batocera$/i.test(displayName)) && installationName && !/^batocera$/i.test(installationName)) {
    return installationName;
  }
  return displayName || fallback;
}

const networkNameChecks = new Map();
function confirmMachineDisplayName(id, host) {
  const previous = networkNameChecks.get(id);
  if (previous?.pending || (previous?.host === host && Date.now() - previous.at < 60000)) return;
  const check = {host, at:Date.now(), pending:true};
  networkNameChecks.set(id,check);
  netbiosName(host,20000)
    .then(identity => saveMachineDisplayName(id,identity))
    .catch(() => {})
    .finally(() => { check.pending = false; });
}

function sshServerBanner(host, timeoutMs = 1200) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port: 22 });
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(String(value || '').slice(0, 160));
    };
    socket.setTimeout(timeoutMs, () => finish(''));
    socket.once('data', chunk => finish(chunk));
    socket.once('error', () => finish(''));
  });
}

async function webIdentity(host) {
  return new Promise(resolve => {
    const req = http.get({ host, port: 80, path: "/", timeout: 900 }, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => {
        body += chunk;
        if (body.length > 2048) {
          req.destroy();
        }
      });
      res.on("end", () => resolve(body.slice(0, 2048)));
    });
    req.on("timeout", () => {
      req.destroy();
      resolve("");
    });
    req.on("error", () => resolve(""));
  });
}

function hasBatoceraIdentity(text) {
  return /\bbatocera\b/i.test(String(text || ""));
}

async function hasBatoceraSshRoms(device, host) {
  if (!device.user) return false;
  try {
    const runtimeDevice = { ...device, host };
    const output = await execSsh(
      runtimeDevice,
      "test -d /userdata/roms && echo BATOCERA_ROMS || true",
      4000
    );
    return output.includes("BATOCERA_ROMS");
  } catch {
    return false;
  }
}

function smbShareRoot(host) {
  return `\\\\${host}\\share`;
}

function smbPathForSystem(host, system, platform = 'batocera') {
  if (platform === 'retropie') {
    const folder = systemFolders[system];
    if (!folder || /[\\/]|\.\./.test(folder)) throw new Error(`Unknown RetroPie system: ${system}`);
    return path.win32.join(`\\\\${host}\\roms`, folder);
  }
  if (platform === 'esde') {
    const folder = systemFolders[system];
    if (!folder || /[\\/]|\.\./.test(folder)) throw new Error(`Unknown ES-DE system: ${system}`);
    return path.win32.join(`\\\\${host}\\ROMs`, folder);
  }
  if (platform === 'emustation') {
    const folder = systemFolders[system];
    if (!folder || /[\\/]|\.\./.test(folder)) throw new Error(`Unknown Emu-Station system: ${system}`);
    return path.win32.join(`\\\\${host}\\Emu-Station`, 'roms', folder);
  }
  if(['lakka','retroarch'].includes(platform)){
    const folder=systemFolders[system];
    if(!folder||/[\\/]|\.\./.test(folder))throw new Error(`Unknown ${platform} system: ${system}`);
    const library=platform==='lakka'?`\\\\${host}\\Roms`:`\\\\${host}\\RetroArch\\roms`;
    return path.win32.join(library,folder);
  }
  if (platform === 'retrobat') {
    const folder = ({'3ds':'3ds',segacd:'megacd',colecovision:'colecovision',odyssey2:'odyssey2',music:'music'})[system] || systemFolders[system];
    if (!folder || /[\\/]|\.\./.test(folder)) throw new Error(`Unknown RetroBat system: ${system}`);
    return path.win32.join(`\\\\${host}\\RetroBat`, 'roms', folder);
  }
  if (system === "music") {
    return path.win32.join(smbShareRoot(host), "music");
  }

  const folder = systemFolders[system];
  if (!folder) {
    throw new Error(`Unknown system: ${system}`);
  }

  return path.win32.join(smbShareRoot(host), "roms", folder);
}

async function hasBatoceraSmbShare(host) {
  return await testWindowsPath(path.win32.join(smbShareRoot(host), "roms"), 3000) ||
    await testWindowsPath(path.win32.join(smbShareRoot(host), "music"), 3000) ||
    await testWindowsPath(path.win32.join(smbShareRoot(host), "system"), 3000);
}

async function probeHost(host, { identify = false } = {}) {
  const [ping, ssh, smb, web] = await Promise.all([
    canPing(host, 2000),
    isTcpPortOpen(host, 22, 1800),
    isTcpPortOpen(host, 445, 1800),
    isTcpPortOpen(host, 80, 1800)
  ]);

  const checks = { ping, ssh, smb, web };
  let identity = "";
  if (identify && (ping || ssh || smb || web)) {
    const names = await Promise.all([
      reverseName(host),
      web ? webIdentity(host) : Promise.resolve(""),
      smb ? netbiosName(host) : Promise.resolve("")
    ]);
    identity = names.join("\n");
  }

  return { host, online: ping || ssh || smb || web, checks, identity };
}

async function resolveDeviceHost(device) {
  const hosts = await resolveDeviceHosts(device);
  return hosts[0] || { host: device.host, resolvedFrom: device.host };
}

function withTimeout(promise, timeoutMs, fallback = null) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), timeoutMs))
  ]);
}

async function resolveDeviceHosts(device, { includeAliases = true } = {}) {
  const aliases = includeAliases ? device.aliases || [] : [];
  const candidates = [device.discoveredHost, device.host, ...aliases].filter(Boolean);
  const seen = new Set();
  const hosts = [];
  if (device.mac) {
    const match = (await arpEntries()).find(entry => entry.mac === String(device.mac).toLowerCase());
    if (match?.host && isAddressOnActiveLan(match.host)) {
      seen.add(match.host);
      hosts.push({ host: match.host, resolvedFrom: "saved machine identity" });
    }
  }
  for (const candidate of candidates) {
    try {
      if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidate)) {
        if (!isAddressOnActiveLan(candidate)) {
          continue;
        }
        if (!seen.has(candidate)) {
          seen.add(candidate);
          hosts.push({ host: candidate, resolvedFrom: candidate });
        }
        continue;
      }

      const record = await withTimeout(dns.lookup(candidate, { family: 4 }), 350);
      if (record?.address && isAddressOnActiveLan(record.address) && !seen.has(record.address)) {
        seen.add(record.address);
        hosts.push({ host: record.address, resolvedFrom: candidate });
      }
    } catch {
      // Try the next configured name.
    }
  }

  return hosts;
}

function saveDiscoveredHost(name, host, access = "ssh", mac = "") {
  const device = devices[name];
  if (!device || !host) {
    return;
  }

  device.discoveredHost = host;
  device.discoveredAccess = access;
  if (mac) device.mac = String(mac).toLowerCase();
  const settings = readDeviceSettings();
  settings[name] = {
    ...(settings[name] || {}),
    host: settings[name]?.host || device.host,
    discoveredHost: host,
    discoveredAccess: access,
    mac: device.mac || settings[name]?.mac || "",
    savedAt: new Date().toISOString()
  };
  writeDeviceSettings(settings);
}

async function getDeviceStatuses({ deep = false, background = true } = {}) {
  const networkSignature = JSON.stringify(activeLanNetworks().sort((a, b) => a.address.localeCompare(b.address)));
  if (networkSignature !== discoveryNetworkSignature) {
    discoveryNetworkSignature = networkSignature;
    discoveryCache = { at: 0, devices: null };
    verifiedOnlineUntil.clear();
    lastScanCandidates = [];
  }
  const cachedDeviceCount = discoveryCache.devices ? Object.keys(discoveryCache.devices).length : 0;
  const configuredDeviceCount = Object.keys(devices).length;
  if (!deep && discoveryCache.devices && Date.now() - discoveryCache.at < 25000 &&
      (cachedDeviceCount > 0 || configuredDeviceCount === 0)) {
    for (const [name, cachedStatus] of Object.entries(discoveryCache.devices)) {
      const device = devices[name];
      const savedHost = device?.discoveredHost;
      const batoceraSshIsLive = savedHost && await isTcpPortOpen(savedHost, 22, 900) &&
        /dropbear/i.test(await sshServerBanner(savedHost, 900));
      if (!cachedStatus.online && batoceraSshIsLive) {
        discoveryCache.devices[name] = {
          ...cachedStatus,
          host: savedHost,
          resolvedFrom: "saved SSH connection",
          online: true,
          reachable: true,
          searching: false,
          access: "ssh",
          checks: { ...cachedStatus.checks, ssh: true },
          identity: "batocera"
        };
      }
      if (discoveryCache.devices[name]?.online && savedHost) confirmMachineDisplayName(name,savedHost);
    }
    if (background && Object.values(discoveryCache.devices).some(device => !device.online)) {
      startDeepDiscovery();
    }
    return discoveryCache.devices;
  }

  const currentArp = await arpEntries();
  const arpMacForHost = host => currentArp.find(entry => entry.host === host)?.mac || "";
  const claimedByAnotherMachine = (name, host) => Object.entries(devices).some(([otherName, other]) =>
    otherName !== name && other.discoveredHost === host
  );

  const entries = await Promise.all(Object.entries(devices).map(async ([name, device]) => {
    if (Number(verifiedOnlineUntil.get(name) || 0) > Date.now() && device.discoveredHost) {
      confirmMachineDisplayName(name,device.discoveredHost);
      return [name, {
        host: device.discoveredHost,
        configuredHost: device.host,
        resolvedFrom: "recent successful SSH command",
        online: true,
        reachable: true,
        searching: false,
        access: "ssh",
        checks: { ping: true, ssh: true, smb: false, web: false },
        identity: "batocera",
        scanCandidates: lastScanCandidates
      }];
    }
    const candidates = await resolveDeviceHosts(device, { includeAliases: deep });
    let status = null;
    let discovery = "";

    for (const candidate of candidates) {
      const currentMac = arpMacForHost(candidate.host);
      if (claimedByAnotherMachine(name, candidate.host) ||
          (device.mac && currentMac && currentMac !== String(device.mac).toLowerCase())) {
        continue;
      }
      const probe = await probeHost(candidate.host, { identify: false });
      status = probe;
      discovery = candidate.resolvedFrom;
      if (probe.online) {
        const matchesSavedHardware = Boolean(device.mac && currentMac &&
          currentMac === String(device.mac).toLowerCase());
        if (matchesSavedHardware && probe.checks.ssh &&
            /dropbear/i.test(await sshServerBanner(candidate.host))) {
          // A MAC identifies the physical computer, not its currently booted
          // operating system. Batocera's Dropbear SSH banner confirms this is
          // the Batocera side of a dual-boot machine; Windows SMB alone does not.
          let verifiedAccess = "";
          if (device.user && await hasBatoceraSshRoms(device, candidate.host)) {
            verifiedAccess = "ssh";
          } else if (probe.checks.smb && await hasBatoceraSmbShare(candidate.host)) {
            verifiedAccess = "smb";
          }
          status = { ...probe, identity: "batocera", access: verifiedAccess };
          if (probe.checks.smb) confirmMachineDisplayName(name,candidate.host);
          if (candidate.host !== device.discoveredHost || device.discoveredAccess !== "ssh") {
          saveDiscoveredHost(name, candidate.host, verifiedAccess || device.discoveredAccess || "ssh", currentMac);
          }
          break;
        }
        status = await probeHost(candidate.host, { identify: true });
        let verifiedAccess = "";
        if (status.checks.ssh && await hasBatoceraSshRoms(device, candidate.host)) {
          verifiedAccess = "ssh";
        } else if (status.checks.smb && await hasBatoceraSmbShare(candidate.host)) {
          verifiedAccess = "smb";
        }
        if (!verifiedAccess) {
          continue;
        }
        status.access = verifiedAccess;
        saveMachineDisplayName(name, status.identity);
        confirmMachineDisplayName(name,candidate.host);
        if (candidate.host !== device.discoveredHost) {
          saveDiscoveredHost(name, candidate.host, verifiedAccess);
        }
        break;
      }
    }

    if (!status && device.host) {
      status = await probeHost(device.host, { identify: true });
      discovery = device.host;
    }

    if (!status) {
      status = { host: "", online: false, checks: { ping: false, ssh: false, smb: false, web: false }, identity: "" };
      discovery = "manual setup";
    }

    if (deep && (!status.online || !hasBatoceraIdentity(status.identity))) {
      const foundMachines = await discoverBatoceraOnLocalNetwork(device, { all: true });
      const found = foundMachines.find(machine => device.mac && machine.mac === String(device.mac).toLowerCase()) ||
        foundMachines.find(machine => !claimedByAnotherMachine(name, machine.host));
      if (found) {
        saveDiscoveredHost(name, found.host, found.access || "ssh", found.mac || "");
        status = found;
        discovery = found.discovery || "local scan";
      }
    }

    // A saved access method describes the last successful boot, not the OS
    // currently running. Only a service verified during this scan may make a
    // machine green; otherwise a dual-boot Windows session can impersonate its
    // previous Batocera session merely by exposing SMB.
    const access = status.access || "";
    const online = access === "ssh" || access === "smb";
    const reachable = Boolean(status.online);
    const searching = !online && !reachable && background;
    return [name, {
      host: searching ? "" : status.host,
      configuredHost: device.host,
      resolvedFrom: searching ? "auto discovery" : discovery,
      online,
      reachable,
      searching,
      access,
      checks: status.checks,
      identity: hasBatoceraIdentity(status.identity) ? "batocera" : "",
      scanCandidates: lastScanCandidates
    }];
  }));
  discoveryCache = { at: Date.now(), devices: Object.fromEntries(entries) };

  if (background && !deep) {
    startDeepDiscovery();
  }

  return discoveryCache.devices;
}

// Display labels are separate from stable device IDs used by layouts and transfers.
const machineNameChecks = new Map();
const verifiedInstallationIds = new Map();
const pendingInstallationChecks = new Map();
function reconcileBatoceraInstallation(id, installationId) {
  if (!installationId) return;
  const settings = readDeviceSettings();
  const previousId = String(settings[id]?.installationId || "").trim();
  verifiedInstallationIds.set(id, installationId);
  if (!previousId || previousId === installationId) return;
  // A fresh image on the same computer is not the old ROM library. Never
  // replay its durable upload queue or show completed jobs on the new install.
  for (const [key, job] of transferJobs) {
    if (job.device !== id) continue;
    if (job.running) {
      job.cancelRequested = true;
      activeUploadCancels.get(key)?.();
    }
    transferJobs.delete(key);
  }
  scheduleTransferPersistence(true);
  fastDeviceStatusCache.at = 0;
  const resetState = readSoftResetState();
  delete resetState.pending?.[`batocera-installation:${previousId}`];
  delete resetState.pending?.[id];
  writeSoftResetState(resetState);
}
async function refreshMachineDisplayNames(statuses) {
  await Promise.all(Object.entries(statuses).map(async ([id, status]) => {
    let settings = readDeviceSettings();
    status.mac = String(devices[id]?.mac || settings[id]?.mac || "").toLowerCase();
    status.displayName = savedMachineDisplayName(settings[id], id);
    status.osVersion = String(settings[id]?.osVersion || "");
    if (!status.online || status.access !== "ssh" || !devices[id]) {
      status.hostName = status.displayName;
      const savedInstallationMatchesName = settings[id]?.installationId &&
        settings[id]?.installationDisplayName === status.displayName;
      status.instanceId = savedInstallationMatchesName
        ? `batocera-installation:${settings[id].installationId}`
        : `batocera-provisional:${status.mac || status.host || id}:${status.displayName}`;
      return;
    }
    const previous = machineNameChecks.get(id);
    if (!previous?.pending && !(previous?.host === status.host && Date.now() - previous.at < 15000)) {
      const check = { host: status.host, at: Date.now(), pending: true };
      machineNameChecks.set(id, check);
      try {
        const output = await execSsh({ ...devices[id], host: status.host }, "configured_hostname=$(sed -n 's/^[[:space:]]*system\\.hostname[[:space:]]*=[[:space:]]*//p' /userdata/system/batocera.conf 2>/dev/null | tail -n 1); [ -n \"$configured_hostname\" ] && printf '%s\\n' \"$configured_hostname\"; batocera-settings-get system.hostname 2>/dev/null; hostname; source=$(findmnt -n -o SOURCE /userdata 2>/dev/null); installation_id=$(blkid -s UUID -o value \"$source\" 2>/dev/null); [ -n \"$installation_id\" ] || installation_id=$(cat /etc/machine-id 2>/dev/null); [ -n \"$installation_id\" ] || installation_id=$(stat -c '%d:%i' /userdata 2>/dev/null); printf '\\nRPO_INSTALLATION_ID=%s\\nRPO_OS_VERSION=%s\\n' \"$installation_id\" \"$(batocera-version 2>/dev/null)\"", 8000);
        const lines = String(output).split(/\r?\n/).map(line => line.trim());
        const validNames = lines.filter(line => line && !line.startsWith("RPO_") && /^[\p{L}\p{N} ._-]{1,128}$/u.test(line));
        // Batocera's configured name is authoritative; the live hostname is
        // a fallback until a newly configured name takes effect after reboot.
        const displayName = validNames[0] && !/^batocera$/i.test(validNames[0])
          ? validNames[0] : (validNames[1] || validNames[0]);
        if (displayName) {
          const installationId = lines.find(line => line.startsWith("RPO_INSTALLATION_ID="))?.slice(20).trim() || "";
          const osVersion = lines.find(line => line.startsWith("RPO_OS_VERSION="))?.slice(15).trim() || "";
          reconcileBatoceraInstallation(id, installationId);
          const current = readDeviceSettings();
          if (current[id]?.machineDisplayName !== displayName ||
              (installationId && current[id]?.installationId !== installationId) ||
              (osVersion && current[id]?.osVersion !== osVersion)) {
            current[id] = {
              ...current[id], machineDisplayName: displayName,
              ...(osVersion ? {osVersion} : {}),
              ...(installationId ? {installationId, installationDisplayName:displayName} : {})
            };
            writeDeviceSettings(current);
            fastDeviceStatusCache.at = 0;
          }
        }
      } catch { /* Keep the last verified label during a connection interruption. */ }
      finally { check.pending = false; }
    }
    settings = readDeviceSettings();
    status.displayName = savedMachineDisplayName(settings[id], id);
    status.osVersion = String(settings[id]?.osVersion || "");
    status.hostName = status.displayName;
    const savedInstallationMatchesName = settings[id]?.installationId &&
      settings[id]?.installationDisplayName === status.displayName;
    status.instanceId = savedInstallationMatchesName
      ? `batocera-installation:${settings[id].installationId}`
      : `batocera-provisional:${status.mac || status.host || id}:${status.displayName}`;
  }));
  return statuses;
}

async function ensureCurrentBatoceraInstallation(id, device) {
  if (!devices[id] || device.access !== "ssh") return;
  const savedId = String(readDeviceSettings()[id]?.installationId || "").trim();
  if (savedId && verifiedInstallationIds.get(id) === savedId) return;
  if (pendingInstallationChecks.has(id)) return pendingInstallationChecks.get(id);
  const check = (async () => {
    // The transfer gate only needs the userdata identity. The former full
    // hostname/version refresh opened a second SSH session and could hold every
    // newly checked ROM for several seconds. This lightweight command compares
    // the same UUID directly; full reconciliation is reserved for a mismatch.
    const output = await execSsh(device,
      'source=$(findmnt -n -o SOURCE /userdata 2>/dev/null); installation_id=$(blkid -s UUID -o value "$source" 2>/dev/null); [ -n "$installation_id" ] || installation_id=$(cat /etc/machine-id 2>/dev/null); [ -n "$installation_id" ] || installation_id=$(stat -c "%d:%i" /userdata 2>/dev/null); printf "%s" "$installation_id"',
      4000);
    const liveId = String(output || "").trim();
    if (savedId && liveId === savedId) {
      verifiedInstallationIds.set(id, liveId);
      return;
    }
    await refreshMachineDisplayNames({[id]: {online:true, access:"ssh", host:device.host}});
    for (let attempt = 0; attempt < 32 && machineNameChecks.get(id)?.pending; attempt += 1) await wait(250);
    const currentId = String(readDeviceSettings()[id]?.installationId || "").trim();
    if (!liveId || !currentId || liveId !== currentId || verifiedInstallationIds.get(id) !== currentId) {
      throw new Error("Could not verify this Batocera installation yet. Wait for its machine card to connect, then retry.");
    }
  })().finally(() => pendingInstallationChecks.delete(id));
  pendingInstallationChecks.set(id, check);
  return check;
}

function invalidateMachineConnection(name) {
  verifiedOnlineUntil.delete(name);
  discoveryCache.at = 0;
  if (discoveryCache.devices?.[name]) {
    discoveryCache.devices[name] = { ...discoveryCache.devices[name], online: false, searching: true };
  }
  startDeepDiscovery();
}

function startDeepDiscovery({ full = false } = {}) {
  if (full) fullSubnetScanRequested = true;
  if (deepDiscoveryPromise) {
    return;
  }

  deepDiscoveryPromise = (async () => {
    try {
      const scanNetworkSignature = discoveryNetworkSignature;
      const template = devices.Batocera || Object.values(devices)[0] || newBatoceraDevice();
      const scanFullSubnet = fullSubnetScanRequested || Date.now() - lastFullSubnetScanAt >= fullSubnetScanIntervalMs;
      fullSubnetScanRequested = false;
      if (scanFullSubnet) lastFullSubnetScanAt = Date.now();
      const foundMachines = await discoverBatoceraOnLocalNetwork(template, { all: true, fullSubnet: scanFullSubnet });
      if (scanNetworkSignature !== discoveryNetworkSignature) return;
      const assignedNames = new Set();
      const entries = [];
      for (const found of foundMachines) {
        let name = Object.keys(devices).find(key => found.mac && devices[key].mac === found.mac);
        if (!name) name = Object.keys(devices).find(key => devices[key].discoveredHost === found.host
          && (!devices[key].mac || !found.mac || devices[key].mac === found.mac));
        if (!name) {
          let index = 1;
          do { name = index === 1 ? "Batocera" : `Batocera ${index}`; index += 1; } while (devices[name] || assignedNames.has(name));
          devices[name] = newBatoceraDevice(found.host, found.mac || "");
        }
        assignedNames.add(name);
        saveDiscoveredHost(name, found.host, found.access || "ssh", found.mac || "");
        saveMachineDisplayName(name, found.identity || found.name);
        confirmMachineDisplayName(name,found.host);
        entries.push([name, {
          host: found.host,
          configuredHost: devices[name].host,
          resolvedFrom: found.discovery || "background scan",
          online: found.access === "ssh" || found.access === "smb",
          reachable: true,
          searching: false,
          access: found.access || "",
          checks: found.checks,
          identity: "batocera",
          platform: "batocera",
          scanCandidates: lastScanCandidates
        }]);
      }
      if (entries.length) {
        discoveryCache = { at: Date.now(), devices: { ...(discoveryCache.devices || {}), ...Object.fromEntries(entries) } };
      } else {
        discoveryCache = { at: 0, devices: null };
      }
    } catch (error) {
      console.error(error);
    } finally {
      deepDiscoveryPromise = null;
    }
  })();
}

function startAutomaticRediscovery() {
  const now = Date.now();
  if (now - lastAutomaticRediscoveryAt < automaticRediscoveryIntervalMs) return;
  lastAutomaticRediscoveryAt = now;
  // A Batocera address can change immediately after a router or machine
  // restart. Periodically repopulate the neighbor table instead of waiting
  // for the manual Find Machines action or the normal 15-minute sweep.
  startDeepDiscovery({ full: now - lastFullSubnetScanAt >= automaticFullSubnetIntervalMs });
}

async function discoverBatoceraOnLocalNetwork(device, { all = false, fullSubnet = true } = {}) {
  const arpHosts = await arpEntries();
  const resolvedHosts = await resolveDeviceHosts(device, { includeAliases: true });
  const scanHosts = fullSubnet ? await getLocalScanHosts(device.host) : [];
  const hosts = [...new Set([
    ...resolvedHosts.map(item => item.host),
    ...arpHosts.map(item => item.host).filter(isAddressOnActiveLan),
    ...scanHosts
  ])];
  const candidates = [];
  const seenCandidates = new Set();
  let index = 0;

  function addCandidate(probe) {
    if (!probe?.host) {
      return;
    }
    if (seenCandidates.has(probe.host)) {
      const existing = candidates.find(candidate => candidate.host === probe.host);
      if (existing && probe.mac && !existing.mac) existing.mac = probe.mac;
      return;
    }
    seenCandidates.add(probe.host);
    candidates.push(probe);
  }

  async function worker() {
    while (index < hosts.length) {
      const host = hosts[index++];
      const [ssh, smb] = await Promise.all([
        isTcpPortOpen(host, 22, 550),
        isTcpPortOpen(host, 445, 550)
      ]);
      const probe = {
        host,
        online: ssh || smb,
        checks: { ping: false, ssh, smb, web: false },
        identity: ""
      };
      if (probe.online) {
        addCandidate(probe);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(16, Math.max(1, hosts.length)) }, worker));
  // Port probes populate the neighbor table; read it again to identify new IPs.
  const refreshedArp = await arpEntries();
  refreshedArp.forEach(entry => {
    if (isAddressOnActiveLan(entry.host) && !isIgnoredScanAddress(entry.host, "")) {
      addCandidate({
        host: entry.host,
        online: true,
        checks: { ping: false, ssh: false, smb: false, web: false },
        identity: "",
        mac: entry.mac
      });
    }
  });
  const namedCandidates = await Promise.all(candidates
    .sort((left, right) => left.host.localeCompare(right.host, undefined, { numeric: true }))
    .slice(0, 30)
    .map(async candidate => ({
      host: candidate.host,
      name: [await reverseName(candidate.host), candidate.checks.smb ? await netbiosName(candidate.host) : ""].filter(Boolean).join(" "),
      checks: candidate.checks,
      mac: candidate.mac || ""
    })));
  lastScanCandidates = namedCandidates;

  const foundMachines = [];
  const foundHosts = new Set();
  const addFound = machine => {
    if (!machine?.host || foundHosts.has(machine.host)) return;
    foundHosts.add(machine.host);
    foundMachines.push(machine);
  };

  for (const candidate of candidates) {
    const named = namedCandidates.find(item => item.host === candidate.host);
    const identity = `${named?.name || ""}\n${candidate.identity || ""}`;
    if (hasBatoceraIdentity(identity)) {
      const machine = { ...candidate, name: named?.name || "", access: "", identity, discovery: "Batocera network name" };
      if (!all) return machine;
      addFound(machine);
    }
  }

  const sshCandidates = candidates.filter(candidate => candidate.checks.ssh);
  const sshMatches = all
    ? (await Promise.all(sshCandidates.map(async candidate => await hasBatoceraSshRoms(device, candidate.host) ? candidate : null))).filter(Boolean)
    : sshCandidates;
  for (const candidate of sshMatches) {
    if (all || await hasBatoceraSshRoms(device, candidate.host)) {
      const machine = { ...candidate, access: "ssh", identity: "batocera ssh /userdata/roms", discovery: "ssh scan" };
      if (!all) return machine;
      addFound(machine);
    }
  }

  for (const candidate of candidates) {
    if (foundHosts.has(candidate.host)) continue;
    if (candidate.checks.smb && await hasBatoceraSmbShare(candidate.host)) {
      const machine = { ...candidate, access: "smb", identity: "batocera smb share", discovery: "smb scan" };
      if (!all) return machine;
      addFound(machine);
    }
  }

  const identityCandidates = candidates.filter(candidate => !foundHosts.has(candidate.host));
  const identityProbes = all
    ? await Promise.all(identityCandidates.map(candidate => probeHost(candidate.host, { identify: true })))
    : identityCandidates;
  for (const candidate of identityProbes) {
    if (foundHosts.has(candidate.host)) continue;
    const identityProbe = all ? candidate : await probeHost(candidate.host, { identify: true });
    if (hasBatoceraIdentity(identityProbe.identity)) {
      const machine = { ...identityProbe, access: identityProbe.checks.ssh ? "ssh" : "", discovery: "local scan" };
      if (!all) return machine;
      addFound(machine);
    }
  }

  return all ? foundMachines : null;
}

async function getRuntimeDevice(name, { skipConnectionProbe = false } = {}) {
  // Platform comes from verified discovery, never from a machine's display name.
  let retroBatMachines = {};
  try {retroBatMachines=JSON.parse(fs.readFileSync(path.join(root,'retrobat-machines.json'),'utf8'));} catch {}
  if (Object.prototype.hasOwnProperty.call(retroBatMachines,name)) {
    const machine=retroBatMachines[name];
    if (!isAddressOnActiveLan(machine.host)) return null;
    const platform=machine.platform||'retrobat';
    if(!['retrobat','recalbox','lakka','retroarch','retropie','esde','emustation'].includes(platform))throw new Error('Unknown machine platform');
    if(['lakka','recalbox'].includes(platform)){
      let credentials=lakkaSessions.get(name);
      if(!credentials){
        let saved={};try{saved=JSON.parse(fs.readFileSync(lakkaCredentialsPath,'utf8'));}catch{}
        const entry=saved[name];
        if(entry?.passwordProtected)credentials={user:entry.user,password:require('./machine-secret')('Unprotect',entry.passwordProtected)};
      }
      if(!credentials)throw new Error(`Credentials required. Right-click ${platform==='recalbox'?'Recalbox':'Lakka'} and enter its SSH username and password.`);
      return {...machine,...credentials,name,platform,access:'ssh'};
    }
    return {...machine,name,platform,access:'smb'};
  }
  if (/^Batocera USB \([A-Z]:\)$/i.test(String(name || ""))) {
    return (await detectBatoceraUsbDevices({ fresh: true })).find(device => device.name === name) || null;
  }
  const device = devices[name];
  if (!device) {
    return null;
  }

  if (!device.user) throw new Error('Credentials required. Right-click this Batocera machine to enter its username and password.');
  const lastVerifiedHost = device.discoveredHost;
  // An inventory request is itself a connection check. Avoid waiting for an
  // additional probe or a full network scan before opening its SSH session.
  if (skipConnectionProbe) {
    const knownHost = lastVerifiedHost || device.host;
    if (knownHost && isAddressOnActiveLan(knownHost)) {
      return { ...device, host: knownHost, access: device.discoveredAccess || "ssh" };
    }
  }
  if (lastVerifiedHost && isAddressOnActiveLan(lastVerifiedHost) &&
      (skipConnectionProbe || await isTcpPortOpen(lastVerifiedHost, 22, 1200))) {
    return { ...device, host: lastVerifiedHost, access: device.discoveredAccess || "ssh" };
  }

  // Do not let a previous successful command keep a disconnected machine green.
  if (lastVerifiedHost) invalidateMachineConnection(name);

  let statuses = await getDeviceStatuses({ deep: false, background: false });
  if (!statuses[name]?.online) {
    statuses = await getDeviceStatuses({ deep: true, background: false });
  }

  return { ...device, host: device.discoveredHost || device.host, access: device.discoveredAccess || "ssh" };
}

function runSoftReset(device) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const command = device.platform === "lakka"
      ? "sh -c '" +
        "cfg=/storage/.config/retroarch/retroarch.cfg; " +
        "test -f \"$cfg\" || exit 2; " +
        "if grep -q \"^menu_show_load_content[[:space:]]*=\" \"$cfg\"; then " +
          "sed -i \"s/^menu_show_load_content[[:space:]]*=.*/menu_show_load_content = \\\"true\\\"/\" \"$cfg\"; " +
        "else printf \"\\nmenu_show_load_content = \\\"true\\\"\\n\" >> \"$cfg\"; fi; " +
        "sync; " +
        "grep -q \"^menu_show_load_content[[:space:]]*=.*true\" \"$cfg\" || exit 3; " +
        "(systemctl restart retroarch.service >/dev/null 2>&1 || systemctl restart retroarch >/dev/null 2>&1 || killall -HUP retroarch >/dev/null 2>&1 || true) & " +
        "echo OK'"
      : "sh -c \"(batocera-es-swissknife --emukill 5 >/dev/null 2>&1 || true; batocera-es-swissknife --restart >/dev/null 2>&1 || /etc/init.d/S31emulationstation restart >/dev/null 2>&1 || (/etc/init.d/S31emulationstation stop >/dev/null 2>&1; /etc/init.d/S31emulationstation start >/dev/null 2>&1)) >/dev/null 2>&1 & echo OK\"";
    let settled = false;
    const timeout = setTimeout(() => {
      fail(new Error("Soft reset command timed out before the machine confirmed receipt."));
    }, 12000);

    const fail = error => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        client.end();
        reject(error);
      }
    };

    client
      .on("ready", () => {
        client.exec(command, (error, stream) => {
          if (error) {
            fail(error);
            return;
          }

          let stderr = "";
          let stdout = "";
          const succeed = () => {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              client.end();
              resolve();
            }
          };
          stream.on("data", chunk => {
            stdout += chunk.toString();
            if (stdout.indexOf("OK") >= 0) {
              succeed();
            }
          });
          stream.stderr.on("data", chunk => {
            stderr += chunk.toString();
          });
          stream.on("close", code => {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              client.end();
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(stderr.trim() || `ssh command exited with code ${code}`));
              }
            }
          });
        });
      })
      .on("error", fail)
      .connect({
        host: device.host,
        username: device.user,
        password: device.password,
        readyTimeout: 8000,
        tryKeyboard: false
      });
  });
}

async function execSsh(device, command, timeoutMs = 15000, abortSignal) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    try { return await execSshOnce(device, command, timeoutMs, abortSignal); }
    catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      if (abortSignal?.aborted || !/unable to exec|forcibly closed|connection.*closed|channel.*open|ECONNRESET|ECONNABORTED|ETIMEDOUT|EPIPE|socket hang up/i.test(message)) throw error;
    }
  }
  throw lastError;
}

function execSshOnce(device, command, timeoutMs = 15000, abortSignal) {
  if (!device.user) return Promise.reject(new Error('Enter credentials by right-clicking this Batocera machine.'));
  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;
    let commandStream;
    const abort=()=>{if(commandStream){try{commandStream.signal('TERM');}catch{}}else fail(new Error('Command cancelled.'));};
    const timeout = setTimeout(() => fail(new Error("SSH command timed out.")), timeoutMs);

    const fail = error => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        abortSignal?.removeEventListener('abort',abort);
        client.end();
        reject(error);
      }
    };

    if(abortSignal?.aborted){fail(new Error('Command cancelled.'));return;}
    abortSignal?.addEventListener('abort',abort,{once:true});
    client
      .on("ready", () => {
        client.exec(command, (error, stream) => {
          if (error) {
            fail(error);
            return;
          }

          commandStream=stream;
          if(abortSignal?.aborted)abort();
          let stdout = "";
          let stderr = "";
          stream.on("data", chunk => {
            stdout += chunk.toString();
          });
          stream.stderr.on("data", chunk => {
            stderr += chunk.toString();
          });
          stream.on("close", code => {
            if (settled) {
              return;
            }
            settled = true;
            clearTimeout(timeout);
            abortSignal?.removeEventListener('abort',abort);
            client.end();
            if (code === 0) {
              resolve(stdout);
            } else {
              reject(new Error(stderr.trim() || stdout.trim() || `ssh command exited with code ${code}`));
            }
          });
        });
      })
      .on("error", fail)
      .connect({
        host: device.host,
        username: device.user,
        password: device.password,
        readyTimeout: 8000,
        tryKeyboard: false
      });
  });
}

function streamSshToFile(device, command, destination) {
  if (!device.user) return Promise.reject(new Error('Enter credentials by right-clicking this Batocera machine.'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  return new Promise((resolve, reject) => {
    const client = new Client();
    const output = fs.createWriteStream(destination);
    let stderr = "", settled = false;
    const fail = error => {
      if (settled) return;
      settled = true; output.destroy(); client.end();
      try { fs.rmSync(destination, { force: true }); } catch {}
      reject(error);
    };
    output.on("error", fail);
    client.on("ready", () => client.exec(command, (error, stream) => {
      if (error) return fail(error);
      stream.stderr.on("data", chunk => { stderr += chunk.toString(); });
      stream.pipe(output);
      stream.on("close", code => output.end(() => {
        if (code === 0) { settled = true; client.end(); resolve(fs.statSync(destination).size); }
        else fail(new Error(stderr.trim() || `Backup command exited with code ${code}`));
      }));
    })).on("error", fail).connect({host:device.host,username:device.user,password:device.password,readyTimeout:8000,tryKeyboard:false});
  });
}

function streamFileToSsh(device, source, command) {
  if (!device.user) return Promise.reject(new Error('Enter credentials by right-clicking this Batocera machine.'));
  return new Promise((resolve, reject) => {
    const client = new Client();
    let stderr = "", settled = false;
    const fail = error => { if (!settled) { settled = true; client.end(); reject(error); } };
    client.on("ready", () => client.exec(command, (error, stream) => {
      if (error) return fail(error);
      stream.stderr.on("data", chunk => { stderr += chunk.toString(); });
      fs.createReadStream(source).on("error", fail).pipe(stream);
      stream.on("close", code => {
        if (settled) return;
        settled = true; client.end();
        code === 0 ? resolve() : reject(new Error(stderr.trim() || `Restore command exited with code ${code}`));
      });
    })).on("error", fail).connect({host:device.host,username:device.user,password:device.password,readyTimeout:8000,tryKeyboard:false});
  });
}

async function getKaraokeStatus(device) {
  const command = [
    "missing='';",
    "test -f /userdata/system/configs/emulationstation/es_systems_karaoke.cfg || missing=\"$missing system\";",
    "test -x /userdata/system/scripts/karaoke-vlc.sh || missing=\"$missing launcher\";",
    "test -d /userdata/roms/karaoke || missing=\"$missing folder\";",
    "test -f /userdata/roms/karaoke/media/images/karaoke.svg || missing=\"$missing image\";",
    "test -f /userdata/roms/karaoke/gamelist.xml || missing=\"$missing gamelist\";",
    "command -v cvlc >/dev/null 2>&1 || missing=\"$missing cvlc\";",
    "command -v batocera-es-swissknife >/dev/null 2>&1 || missing=\"$missing es-refresh\";",
    "if [ -z \"$missing\" ]; then echo INSTALLED; else echo MISSING:$missing; fi"
  ].join(" ");
  const output = (await execSsh(device, command)).trim();
  const installed = output.includes("INSTALLED");
  const missing = installed ? [] : output.replace(/^MISSING:/, "").trim().split(/\s+/).filter(Boolean);
  return { installed, missing };
}

function karaokeInstallCommand() {
  return `
mkdir -p /userdata/roms/karaoke/media/images /userdata/system/scripts /userdata/system/configs/emulationstation /userdata/system/logs
cat > /userdata/system/configs/emulationstation/es_systems_karaoke.cfg <<'EOF'
<?xml version="1.0"?>
<systemList>
  <system>
    <fullname>Karaoke</fullname>
    <name>karaoke</name>
    <manufacturer>Batocera</manufacturer>
    <release>2026</release>
    <hardware>media</hardware>
    <path>/userdata/roms/karaoke</path>
    <extension>.cdg .CDG</extension>
    <command>/userdata/system/scripts/karaoke-vlc.sh "%ROM%"</command>
    <platform>pc</platform>
    <theme>karaoke</theme>
    <group>karaoke</group>
  </system>
</systemList>
EOF
cat > /userdata/system/scripts/karaoke-vlc.sh <<'EOF'
#!/bin/sh
log=/userdata/system/logs/bw-karaoke-vlc.log
killall vlc cvlc 2>/dev/null || true
mkdir -p /userdata/system/logs
{
  echo "--- $(date) ---"
  echo "argc=$#"
  i=1
  for arg in "$@"; do echo "arg$i=$arg"; i=$((i + 1)); done
} >> "$log"

rom="$1"
if [ ! -f "$rom" ]; then
  unescaped="$(printf '%s' "$rom" | sed 's/\\\\//g')"
  if [ -f "$unescaped" ]; then
    rom="$unescaped"
  fi
fi

if [ ! -f "$rom" ] && [ $# -gt 1 ]; then
  joined="$*"
  if [ -f "$joined" ]; then
    rom="$joined"
  else
    unescaped="$(printf '%s' "$joined" | sed 's/\\\\//g')"
    if [ -f "$unescaped" ]; then
      rom="$unescaped"
    fi
  fi
fi

if [ ! -f "$rom" ]; then
  echo "missing_rom=$rom" >> "$log"
  exit 1
fi

base="\${rom%.*}"
mp3="$base.mp3"
MP3="$base.MP3"

export HOME=/userdata/system
export XDG_CONFIG_HOME=/userdata/system/.config
export XDG_CACHE_HOME=/userdata/system/.cache
export XDG_RUNTIME_DIR=/var/run
export DISPLAY=\${DISPLAY:-:0}

echo "DISPLAY=$DISPLAY" >> "$log"
echo "rom=$rom" >> "$log"
echo "mp3=$mp3 exists=$([ -f "$mp3" ] && echo yes || echo no)" >> "$log"

if [ -f "$mp3" ]; then
  exec /usr/bin/cvlc -I dummy --vout xcb_x11 --fullscreen --play-and-exit --no-video-title-show --input-slave="$rom" "$mp3" >> "$log" 2>&1
fi

if [ -f "$MP3" ]; then
  exec /usr/bin/cvlc -I dummy --vout xcb_x11 --fullscreen --play-and-exit --no-video-title-show --input-slave="$rom" "$MP3" >> "$log" 2>&1
fi

exec /usr/bin/cvlc -I dummy --vout xcb_x11 --fullscreen --play-and-exit --no-video-title-show "$rom" >> "$log" 2>&1
EOF
chmod 644 /userdata/system/configs/emulationstation/es_systems_karaoke.cfg
chmod 755 /userdata/system/scripts/karaoke-vlc.sh
chmod 644 /userdata/roms/karaoke/media/images/karaoke.svg
cat > /userdata/roms/karaoke/gamelist.xml <<'EOF'
<?xml version="1.0"?>
<gameList>
EOF
for f in /userdata/roms/karaoke/*.cdg /userdata/roms/karaoke/*.CDG; do
  [ -f "$f" ] || continue
  base="$(basename "$f")"
  name="$(printf '%s' "$base" | sed 's/\\.[^.]*$//')"
  esc_base="$(printf '%s' "$base" | sed 's/&/\\&amp;/g; s/</\\&lt;/g; s/>/\\&gt;/g; s/"/\\&quot;/g')"
  esc_name="$(printf '%s' "$name" | sed 's/&/\\&amp;/g; s/</\\&lt;/g; s/>/\\&gt;/g; s/"/\\&quot;/g')"
  printf '  <game>\\n    <path>./%s</path>\\n    <name>%s</name>\\n    <image>./media/images/karaoke.svg</image>\\n    <marquee>./media/images/karaoke.svg</marquee>\\n  </game>\\n' "$esc_base" "$esc_name" >> /userdata/roms/karaoke/gamelist.xml
done
cat >> /userdata/roms/karaoke/gamelist.xml <<'EOF'
</gameList>
EOF
chmod 644 /userdata/roms/karaoke/gamelist.xml
(batocera-es-swissknife --restart 5 >/tmp/bw-karaoke-install-restart.log 2>&1 &)
echo OK
`;
}

async function installKaraoke(device) {
  const iconPath = path.join(uiRoot, "karaoke-icon.svg");
  if (!fs.existsSync(iconPath)) throw new Error("Ready Player One's built-in Karaoke icon is missing.");
  await sftpWithDevice(device, async sftp => {
    await mkdirpSftp(sftp, "/userdata/roms/karaoke/media/images");
    await fastPutSftp(sftp, iconPath, "/userdata/roms/karaoke/media/images/karaoke.svg");
  });
  await execSsh(device, karaokeInstallCommand(), 30000);
  return getKaraokeStatus(device);
}

async function getPiKaraokeStatus(device) {
  const command = [
    "root=/userdata/system/ready-player-one/pikaraoke;",
    "has(){ if eval \"$2\" >/dev/null 2>&1; then printf '%s=1\\n' \"$1\"; else printf '%s=0\\n' \"$1\"; fi; };",
    "has console \"test -f /userdata/system/configs/emulationstation/es_systems_pikaraoke.cfg\";",
    "has label \"grep -Fq '<fullname>PiKaraoke</fullname>' /userdata/system/configs/emulationstation/es_systems_pikaraoke.cfg && ! grep -Fq 'PiKaraoke (Beta)' /userdata/system/configs/emulationstation/es_systems_pikaraoke.cfg\";",
    "has theme \"grep -Fq '<theme>pikaraoke</theme>' /userdata/system/configs/emulationstation/es_systems_pikaraoke.cfg\";",
    "has launcher \"test -x $root/launch.sh && test ! -e /userdata/system/scripts/pikaraoke-launch.sh\";",
    "has launcher_v2 \"grep -Fq 'url=http://127.0.0.1:5555/splash' /userdata/system/scripts/pikaraoke-launch.sh && grep -Fq 'su - batocera' /userdata/system/scripts/pikaraoke-launch.sh\";",
    "has launcher_v3 \"grep -Fq 'DBUS_SESSION_BUS_ADDRESS' /userdata/system/scripts/pikaraoke-launch.sh && grep -Fq 'exec flatpak run org.chromium.Chromium' /userdata/system/scripts/pikaraoke-launch.sh\";",
    "has launcher_v12 \"grep -Fq 'native_browser=/userdata/system/pikaraoke-native-browser' $root/launch.sh && grep -Fq 'root-profile' $root/launch.sh && grep -Fq 'XDG_RUNTIME_DIR=/var/run' $root/launch.sh\";",
    "has entry \"test -f /userdata/roms/pikaraoke/PiKaraoke.sh\";",
    "has image \"test -s /userdata/roms/pikaraoke/media/images/pikaraoke.png && grep -Fq '<image>./media/images/pikaraoke.png</image>' /userdata/roms/pikaraoke/gamelist.xml\";",
    "has app \"test -x $root/bin/pikaraoke\";",
    "has uv \"test -x $root/uv/uv || command -v uv\";",
    "has ffmpeg \"command -v ffmpeg\";",
    "has javascript \"command -v node || command -v deno || test -x $root/deno/bin/deno\";",
    "has browser \"test -x /userdata/system/pikaraoke-native-browser/firefox/firefox || command -v batocera-browser || command -v chromium || command -v chromium-browser || command -v firefox\";"
  ].join(" ");
  const output = await execSsh(device, command, 30000);
  const components = Object.fromEntries(output.trim().split(/\r?\n/).map(line => line.split("=")).filter(parts => parts.length === 2).map(([key, value]) => [key, value === "1"]));
  const required = ["console", "label", "theme", "launcher", "launcher_v12", "entry", "image", "app", "uv", "ffmpeg", "javascript", "browser"];
  const missing = required.filter(name => !components[name]);
  return { installed: missing.length === 0, missing, components };
}

function piKaraokeInstallCommand() {
  return `set -e
root=/userdata/system/ready-player-one/pikaraoke
mkdir -p "$root" "$root/home" "$root/cache" "$root/tools" "$root/bin" /userdata/roms/pikaraoke/media/images /userdata/roms/karaoke /userdata/system/scripts /userdata/system/configs/emulationstation /userdata/system/logs

command -v curl >/dev/null 2>&1 || { echo 'PiKaraoke needs curl, but this Batocera installation does not provide it.' >&2; exit 20; }
command -v ffmpeg >/dev/null 2>&1 || { echo 'PiKaraoke needs FFmpeg, but this Batocera installation does not provide it.' >&2; exit 21; }

native_browser=/userdata/system/pikaraoke-native-browser
if [ ! -x "$native_browser/firefox/firefox" ]; then
  [ "$(uname -m)" = "x86_64" ] || { echo 'Automatic Firefox installation is currently supported only on x86-64 Batocera.' >&2; exit 26; }
  mkdir -p "$native_browser"
  archive="$native_browser/firefox.tar.xz"
  curl -fL --connect-timeout 20 --max-time 300 --retry 2 -o "$archive" 'https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=en-US'
  tar -xJf "$archive" -C "$native_browser"
  rm -f "$archive"
fi
test -x "$native_browser/firefox/firefox" || { echo 'The PiKaraoke browser could not be installed.' >&2; exit 29; }
mkdir -p "$native_browser/home"
chown batocera:batocera "$native_browser" "$native_browser/home"

# Inspect first. Existing components are deliberately preserved and are never
# downloaded a second time merely because Apply was clicked again.
if command -v uv >/dev/null 2>&1; then
  uvbin="$(command -v uv)"
elif [ -x "$root/uv/uv" ]; then
  uvbin="$root/uv/uv"
else
  export UV_INSTALL_DIR="$root/uv"
  curl --connect-timeout 20 --max-time 180 --retry 2 -LsSf https://astral.sh/uv/install.sh | sh
  uvbin="$root/uv/uv"
fi
test -x "$uvbin" || { echo 'The UV runtime could not be installed.' >&2; exit 22; }

if ! command -v node >/dev/null 2>&1 && ! command -v deno >/dev/null 2>&1 && [ ! -x "$root/deno/bin/deno" ]; then
  export DENO_INSTALL="$root/deno"
  curl --connect-timeout 20 --max-time 180 --retry 2 -fsSL https://deno.land/install.sh | sh
fi
if ! command -v node >/dev/null 2>&1 && ! command -v deno >/dev/null 2>&1 && [ ! -x "$root/deno/bin/deno" ]; then
  echo 'PiKaraoke needs Node or Deno, and the Deno runtime could not be installed.' >&2
  exit 23
fi

export HOME="$root/home"
export UV_TOOL_DIR="$root/tools"
export UV_TOOL_BIN_DIR="$root/bin"
export UV_PYTHON_INSTALL_DIR="$root/python"
export UV_CACHE_DIR="$root/cache"
export PATH="$root/bin:$root/deno/bin:$PATH"
if [ ! -x "$root/bin/pikaraoke" ]; then
  "$uvbin" tool install --python 3.12 pikaraoke
fi
test -x "$root/bin/pikaraoke" || { echo 'PiKaraoke installation did not produce a runnable program.' >&2; exit 24; }

cat > /userdata/system/configs/emulationstation/es_systems_pikaraoke.cfg <<'EOF'
<?xml version="1.0"?>
<systemList>
  <system>
    <fullname>PiKaraoke</fullname>
    <name>pikaraoke</name>
    <manufacturer>Ready Player One</manufacturer>
    <release>2026</release>
    <hardware>media</hardware>
    <path>/userdata/roms/pikaraoke</path>
    <extension>.sh .SH</extension>
    <command>/userdata/system/ready-player-one/pikaraoke/launch.sh "%ROM%"</command>
    <platform>pc</platform>
    <theme>pikaraoke</theme>
  </system>
</systemList>
EOF

cat > "$root/launch.sh" <<'EOF'
#!/bin/sh
root=/userdata/system/ready-player-one/pikaraoke
app="$root/bin/pikaraoke"
log=/userdata/system/logs/rp1-pikaraoke.log
export HOME="$root/home"
export XDG_CONFIG_HOME="$root/home/.config"
export XDG_CACHE_HOME="$root/cache"
export UV_TOOL_DIR="$root/tools"
export UV_TOOL_BIN_DIR="$root/bin"
export UV_PYTHON_INSTALL_DIR="$root/python"
export UV_CACHE_DIR="$root/cache"
export PATH="$root/bin:$root/deno/bin:$PATH"
export DISPLAY="\${DISPLAY:-:0.0}"
export XDG_RUNTIME_DIR="\${XDG_RUNTIME_DIR:-/var/run}"
if [ -z "$DBUS_SESSION_BUS_ADDRESS" ]; then
  es_pid="$(pidof emulationstation 2>/dev/null | awk '{print $1}')"
  if [ -n "$es_pid" ] && [ -r "/proc/$es_pid/environ" ]; then
    es_dbus="$(tr '\\0' '\\n' < "/proc/$es_pid/environ" | sed -n 's/^DBUS_SESSION_BUS_ADDRESS=//p' | head -n 1)"
    [ -n "$es_dbus" ] && export DBUS_SESSION_BUS_ADDRESS="$es_dbus"
  fi
fi
mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" /userdata/roms/karaoke /userdata/system/logs

if ! curl --max-time 2 -fsS http://127.0.0.1:5555/ >/dev/null 2>&1; then
  help="$($app --help 2>&1 || true)"
  args=""
  printf '%s' "$help" | grep -q -- '--headless' && args="$args --headless"
  cd /userdata/roms/karaoke
  nohup "$app" $args >>"$log" 2>&1 &
fi

i=0
while [ "$i" -lt 60 ]; do
  curl --max-time 2 -fsS http://127.0.0.1:5555/ >/dev/null 2>&1 && break
  i=$((i + 1)); sleep 1
done
url=http://127.0.0.1:5555/splash
native_browser=/userdata/system/pikaraoke-native-browser
if [ -x "$native_browser/firefox/firefox" ]; then
  browser_home="$native_browser/root-home"
  browser_profile="$native_browser/root-profile"
  mkdir -p "$browser_home/.config" "$browser_home/.cache" "$browser_home/.local/share" "$browser_profile"
  # PiKaraoke owns one dedicated Firefox session. Close only that session before
  # relaunching, then discard locks left behind by an interrupted launch.
  pkill -f "$native_browser/firefox/firefox" >/dev/null 2>&1 || true
  i=0
  while pgrep -f "$native_browser/firefox/firefox" >/dev/null 2>&1 && [ "$i" -lt 20 ]; do
    i=$((i + 1)); sleep 0.1
  done
  rm -f "$browser_profile/lock" "$browser_profile/.parentlock" "$browser_profile/parent.lock"
  export HOME="$browser_home"
  export XDG_CONFIG_HOME="$browser_home/.config"
  export XDG_CACHE_HOME="$browser_home/.cache"
  export XDG_DATA_HOME="$browser_home/.local/share"
  export XDG_RUNTIME_DIR=/var/run
  exec "$native_browser/firefox/firefox" --profile "$browser_profile" --no-remote --kiosk "$url" >>"$log" 2>&1
fi
if command -v batocera-browser >/dev/null 2>&1; then exec batocera-browser "$url" >>"$log" 2>&1; fi
if command -v chromium >/dev/null 2>&1; then exec chromium --kiosk "$url" >>"$log" 2>&1; fi
if command -v chromium-browser >/dev/null 2>&1; then exec chromium-browser --kiosk "$url" >>"$log" 2>&1; fi
if command -v firefox >/dev/null 2>&1; then exec firefox --kiosk "$url" >>"$log" 2>&1; fi
if command -v flatpak >/dev/null 2>&1; then
  browser_home=/userdata/system/pikaraoke-browser-home
  mkdir -p "$browser_home/.config" "$browser_home/.cache" "$browser_home/.local/share" "$browser_home/runtime"
  chown -R 1000:1000 "$browser_home"
  chmod 700 "$browser_home" "$browser_home/runtime"
  browser_command="HOME='$browser_home' XDG_CONFIG_HOME='$browser_home/.config' XDG_CACHE_HOME='$browser_home/.cache' XDG_DATA_HOME='$browser_home/.local/share' XDG_RUNTIME_DIR='$browser_home/runtime' DISPLAY='$DISPLAY' GTK_USE_PORTAL=0 flatpak --user run --no-session-bus --no-a11y-bus --socket=x11 org.chromium.Chromium --kiosk --no-first-run --disable-session-crashed-bubble '$url'"
  exec su batocera -s /bin/sh -c "$browser_command" >>"$log" 2>&1
fi
ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
command -v batocera-notification >/dev/null 2>&1 && batocera-notification "PiKaraoke is running at http://$ip:5555"
exit 0
EOF

cat > /userdata/roms/pikaraoke/PiKaraoke.sh <<'EOF'
#!/bin/sh
exec /userdata/system/ready-player-one/pikaraoke/launch.sh
EOF
cat > /userdata/roms/pikaraoke/gamelist.xml <<'EOF'
<?xml version="1.0"?>
<gameList>
  <game>
    <path>./PiKaraoke.sh</path>
    <name>PiKaraoke</name>
    <desc>Phone-controlled karaoke server and player.</desc>
    <image>./media/images/pikaraoke.png</image>
    <thumbnail>./media/images/pikaraoke.png</thumbnail>
    <marquee>./media/images/pikaraoke.png</marquee>
  </game>
</gameList>
EOF
chmod 755 "$root/launch.sh" /userdata/roms/pikaraoke/PiKaraoke.sh
chmod 644 /userdata/system/configs/emulationstation/es_systems_pikaraoke.cfg /userdata/roms/pikaraoke/gamelist.xml
rm -f /userdata/system/scripts/pikaraoke-launch.sh
echo OK
`;
}

async function installPiKaraoke(device) {
  if (!device || device.access !== "ssh" || (device.platform && device.platform !== "batocera")) {
    throw new Error("Select a connected Batocera machine with SSH access.");
  }
  const before = await getPiKaraokeStatus(device);
  if (!before.installed) {
    await execSsh(device, piKaraokeInstallCommand(), 600000);
    const iconPath = path.join(uiRoot, "pikaraoke-icon.png");
    if (!fs.existsSync(iconPath)) throw new Error("Ready Player One's built-in PiKaraoke icon is missing.");
    await sftpWithDevice(device, async sftp => {
      await mkdirpSftp(sftp, "/userdata/roms/pikaraoke/media/images");
      await fastPutSftp(sftp, iconPath, "/userdata/roms/pikaraoke/media/images/pikaraoke.png");
    });
  }
  const after = await getPiKaraokeStatus(device);
  if (!after.installed) throw new Error(`PiKaraoke setup is incomplete: ${after.missing.join(", ")}.`);
  if (!before.components?.console || !before.components?.launcher || !before.components?.entry) await runSoftReset(device);
  return { ...after, checkedBeforeInstall: true, alreadyInstalled: before.installed, installedComponents: before.missing.filter(name => !after.missing.includes(name)) };
}

const sftpSessionCache = new Map();
// Multiple ROMs can copy at once. The former 64 writes per file starved the UI,
// but one write per file throttled large disc images. Keep the combined number
// of in-flight writes bounded while allowing large files to fill the LAN link.
function sftpTransferOptions(fileSize) {
  return { concurrency: fileSize > 50 * 1024 * 1024 ? 8 : 3, chunkSize: 512 * 1024 };
}

function closeSftpSession(host) {
  const cached = sftpSessionCache.get(host);
  sftpSessionCache.delete(host);
  if (cached?.client) {
    cached.client.end();
  }
}

function getSftpSession(device) {
  const cached = sftpSessionCache.get(device.host);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.promise;
  }

  const entry = { client: null, lastUsed: Date.now(), promise: null };
  entry.promise = new Promise((resolve, reject) => {
    const client = new Client();
    entry.client = client;
    let settled = false;

    const fail = error => {
      if (!settled) {
        settled = true;
        sftpSessionCache.delete(device.host);
        client.end();
        reject(error);
      }
    };

    client
      .on("ready", () => {
        client.sftp((error, sftp) => {
          if (error) {
            fail(error);
            return;
          }
          settled = true;
          resolve({ client, sftp });
        });
      })
      .on("error", fail)
      .on("close", () => sftpSessionCache.delete(device.host))
      .connect({
        host: device.host,
        username: device.user,
        password: device.password,
        readyTimeout: 8000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
        tryKeyboard: false
      });
  });
  sftpSessionCache.set(device.host, entry);
  return entry.promise;
}

function isTransientSshError(error) {
  return /not connected|connection|ECONN|handshake|channel|socket|closed|timed?\s*out|reset/i.test(String(error?.message || error));
}

async function sftpWithDevice(device, work) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const session = await getSftpSession(device);
      const cached = sftpSessionCache.get(device.host);
      if (cached) cached.lastUsed = Date.now();
      return await work(session.sftp, session.client);
    } catch (error) {
      closeSftpSession(device.host);
      if (attempt === 0 && isTransientSshError(error)) {
        await new Promise(resolve => setTimeout(resolve, 350));
        continue;
      }
      throw error;
    }
  }
}

const idleUploadSftpSessions = new Map();

function closeUploadSftpSession(entry) {
  if (entry.closed) return;
  entry.closed = true;
  clearTimeout(entry.timer);
  if (idleUploadSftpSessions.get(entry.host) === entry) idleUploadSftpSessions.delete(entry.host);
  entry.client.end();
}

function sftpWithDedicatedDeviceOnce(device, work, registerCancel = null) {
  return new Promise((resolve, reject) => {
    let cached = idleUploadSftpSessions.get(device.host);
    if (cached) {
      idleUploadSftpSessions.delete(device.host);
      clearTimeout(cached.timer);
      if (cached.user !== device.user || cached.password !== device.password) {
        closeUploadSftpSession(cached);
        cached = null;
      }
    }
    const entry = cached || {
      host: device.host, user: device.user, password: device.password,
      client: new Client(), sftp: null, timer: null, activeFail: null, closed: false
    };
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      entry.activeFail = null;
      if (error) {
        closeUploadSftpSession(entry);
        reject(error);
        return;
      }
      // Keep one upload-only connection warm for the next ROM. Large uploads
      // never share the browsing SFTP session, and concurrent uploads still
      // receive separate connections.
      const previous = idleUploadSftpSessions.get(device.host);
      if (previous) closeUploadSftpSession(previous);
      entry.timer = setTimeout(() => {
        closeUploadSftpSession(entry);
      }, 60000);
      entry.timer.unref?.();
      idleUploadSftpSessions.set(device.host, entry);
      resolve(value);
    };
    entry.activeFail = finish;
    registerCancel?.(() => entry.activeFail?.(new Error("Transfer paused by user.")));
    const startWork = () => Promise.resolve().then(() => work(entry.sftp, entry.client)).then(value => finish(null, value), finish);
    if (cached) {
      startWork();
      return;
    }
    entry.client
      .on("ready", () => {
        entry.client.sftp((error, channel) => {
          if (error) return finish(error);
          entry.sftp = channel;
          startWork();
        });
      })
      .on("error", error => {
        entry.activeFail?.(error);
        closeUploadSftpSession(entry);
      })
      .on("close", () => {
        entry.activeFail?.(new Error("SSH upload connection closed."));
        closeUploadSftpSession(entry);
      })
      .connect({
        host: device.host,
        username: device.user,
        password: device.password,
        readyTimeout: 8000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
        tryKeyboard: false
      });
  });
}

async function sftpWithDedicatedDevice(device, work, registerCancel = null) {
  // Batocera can briefly reset a new SSH channel while EmulationStation and
  // Warehouse status checks are using the same machine. Give an upload a
  // longer, back-off protected startup window before declaring it stopped.
  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await sftpWithDedicatedDeviceOnce(device, work, registerCancel);
    } catch (error) {
      if (attempt < maxAttempts - 1 && isTransientSshError(error)) {
        await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

function execOnSshClient(client, command) {
  return new Promise((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) return reject(error);
      let stdout = "";
      let stderr = "";
      stream.on("data", chunk => { stdout += chunk.toString(); });
      stream.stderr.on("data", chunk => { stderr += chunk.toString(); });
      stream.on("close", code => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `Command exited with code ${code}`)));
    });
  });
}

function readSftpFile(sftp, filePath) {
  return new Promise((resolve, reject) => {
    sftp.readFile(filePath, (error, data) => error ? reject(error) : resolve(data.toString("utf8")));
  });
}

function readSftpBuffer(sftp, filePath) {
  return new Promise((resolve, reject) => {
    sftp.readFile(filePath, (error, data) => error ? reject(error) : resolve(data));
  });
}

function writeSftpFile(sftp, filePath, content) {
  return new Promise((resolve, reject) => {
    sftp.writeFile(filePath, content, error => error ? reject(error) : resolve());
  });
}

function machineBehaviorSpec(device) {
  const platform = String(device?.platform || "batocera").toLowerCase();
  if (platform === "batocera") return { platform, kind: "emulationstation", path: "/userdata/system/configs/emulationstation/es_settings.cfg" };
  if (platform === "recalbox") return { platform, kind: "emulationstation", path: "/recalbox/share/system/.emulationstation/es_settings.cfg" };
  if (platform === "lakka") return { platform, kind: "retroarch", path: "/storage/.config/retroarch/retroarch.cfg" };
  return { platform, kind: "unsupported", path: "" };
}

function readMachineBehaviorState() {
  try {
    const value = JSON.parse(fs.readFileSync(machineBehaviorStatePath, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function writeMachineBehaviorState(value) {
  const temporary = `${machineBehaviorStatePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, machineBehaviorStatePath);
}

function xmlSetting(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(content).match(new RegExp(`<(?:bool|int|string)\\b[^>]*\\bname=["']${escaped}["'][^>]*\\bvalue=["']([^"']*)["'][^>]*/>`, "i"));
  return match ? match[1] : null;
}

function setXmlSetting(content, type, name, value) {
  const line = `<${type} name="${name}" value="${String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" />`;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\s*<(?:bool|int|string)\\b[^>]*\\bname=["']${escaped}["'][^>]*/>`, "i");
  if (pattern.test(content)) return content.replace(pattern, `\n${line}`);
  if (/<\/config>/i.test(content)) return content.replace(/\s*<\/config>/i, `\n${line}\n</config>`);
  return `<?xml version="1.0"?>\n<config>\n${line}\n</config>\n`;
}

function removeXmlSetting(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(content).replace(new RegExp(`\\s*<(?:bool|int|string)\\b[^>]*\\bname=["']${escaped}["'][^>]*/>`, "ig"), "");
}

function retroarchSetting(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(content).match(new RegExp(`^\\s*${escaped}\\s*=\\s*["']?([^"'\\r\\n]+)`, "mi"));
  return match ? match[1].trim() : null;
}

function setRetroarchSetting(content, name, value) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = `${name} = "${value}"`;
  const pattern = new RegExp(`^\\s*${escaped}\\s*=.*$`, "mi");
  return pattern.test(content) ? content.replace(pattern, line) : `${String(content).replace(/\s*$/, "")}\n${line}\n`;
}

function batoceraSetting(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(content).match(new RegExp(`^\\s*${escaped}\\s*=\\s*(.*?)\\s*$`, "mi"));
  return match ? match[1].trim() : null;
}

function setBatoceraSetting(content, name, value) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^\\s*${escaped}\\s*=.*$`, "mi");
  return pattern.test(content) ? content.replace(pattern, line) : `${String(content).replace(/\s*$/, "")}\n${line}\n`;
}

function removeBatoceraSetting(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(content).replace(new RegExp(`^\\s*${escaped}\\s*=.*(?:\\r?\\n|$)`, "gmi"), "");
}

function xboxVideoModeChoice(value) {
  const mode = String(value || "").trim();
  return /^1280x720(?:\.|$)/i.test(mode) ? "1280x720" : mode || "AUTO";
}

const wifiPowerSaverBlock = `# READY PLAYER ONE WIFI STABILITY BEGIN
case "$1" in
  start)
    (for attempt in $(seq 1 30); do iw dev wlan0 set power_save off 2>/dev/null && exit 0; sleep 1; done) &
    ;;
esac
# READY PLAYER ONE WIFI STABILITY END`;

function setWifiPowerSaverStartup(content, enabled) {
  const withoutBlock = String(content || "").replace(/\n?# READY PLAYER ONE WIFI STABILITY BEGIN[\s\S]*?# READY PLAYER ONE WIFI STABILITY END\n?/g, "\n").trim();
  if (enabled) return withoutBlock ? `${withoutBlock}\n` : "#!/bin/bash\n";
  const base = withoutBlock || "#!/bin/bash";
  return `${base}\n${wifiPowerSaverBlock}\n`;
}

async function supportedXbox720Mode(client) {
  const modes = await execOnSshClient(client, "DISPLAY=:0 batocera-resolution listModes");
  const names = modes.split(/\r?\n/).map(line => line.split(":", 1)[0].trim());
  const mode = names.find(name => name === "1280x720.60.00") || names.find(name => /^1280x720\.\d+\.\d+$/.test(name));
  if (!mode) throw new Error("This machine does not report a supported 720p video mode.");
  return mode;
}

async function getMachineBehavior(device) {
  const spec = machineBehaviorSpec(device);
  if (spec.kind === "unsupported" || device?.access !== "ssh") return { supported: false, platform: spec.platform, reason: "This machine does not expose remote behavior controls through RP1." };
  return sftpWithDevice(device, async (sftp, client) => {
    const [content, batoceraConfig, wifiPowerState] = await Promise.all([
      readSftpFile(sftp, spec.path).catch(() => spec.kind === "emulationstation" ? '<?xml version="1.0"?>\n<config>\n</config>\n' : ""),
      spec.platform === "batocera" ? readSftpFile(sftp, "/userdata/system/batocera.conf").catch(() => "") : Promise.resolve(""),
      spec.platform === "batocera" ? execOnSshClient(client, "iw dev wlan0 get power_save 2>/dev/null || true", 5000) : Promise.resolve("")
    ]);
    if (spec.kind === "retroarch") {
      const timeout = Number(retroarchSetting(content, "menu_screensaver_timeout") || 0);
      return { supported: true, platform: spec.platform, kind: spec.kind, screenSaverMinutes: Math.max(0, Math.round(timeout / 60)), capabilities: { screenSaverTime: true, systemSleepTime: false, behavior: false, powerSaver: false } };
    }
    return {
      supported: true, platform: spec.platform, kind: spec.kind,
      screenSaverMinutes: Math.max(0, Math.round(Number(xmlSetting(content, "ScreenSaverTime") || 300000) / 60000)),
      systemSleepMinutes: Math.max(0, Math.round(Number(xmlSetting(content, "SystemSleepTime") || 0) / 60000)),
      behavior: xmlSetting(content, "ScreenSaverBehavior") || "dim",
      powerSaver: xmlSetting(content, "PowerSaverMode") || "default",
      xboxRenderer: String(batoceraSetting(batoceraConfig, "xbox.xemu_api") || "AUTO").toUpperCase(),
      xboxVideoMode: xboxVideoModeChoice(batoceraSetting(batoceraConfig, "xbox.videomode")),
      wifiPowerSaver: /power save:\s*on/i.test(wifiPowerState),
      capabilities: { screenSaverTime: true, systemSleepTime: true, behavior: true, powerSaver: true, xboxRenderer: spec.platform === "batocera", xboxVideoMode: spec.platform === "batocera", wifiPowerSaver: spec.platform === "batocera" }
    };
  });
}

async function applyMachineBehavior(deviceName, device, values, restore = false) {
  const spec = machineBehaviorSpec(device);
  if (spec.kind === "unsupported" || device?.access !== "ssh") throw new Error("Machine Behavior is not remotely configurable for this platform.");
  const allowedMinutes = new Set([0, 1, 3, 5, 10, 15, 30, 60]);
  const screenSaverMinutes = Number(values.screenSaverMinutes);
  const systemSleepMinutes = Number(values.systemSleepMinutes);
  if (!restore && (!allowedMinutes.has(screenSaverMinutes) || spec.kind === "emulationstation" && !allowedMinutes.has(systemSleepMinutes))) throw new Error("Choose a supported idle time.");
  const allowedBehaviors = new Set(["dim", "black", "random video", "slideshow", "suspend"]);
  const allowedPower = new Set(["default", "enhanced", "instant", "disabled"]);
  if (!restore && spec.kind === "emulationstation" && (!allowedBehaviors.has(values.behavior) || !allowedPower.has(values.powerSaver))) throw new Error("Choose supported machine behavior settings.");
  const xboxRenderer = String(values.xboxRenderer || "AUTO").toUpperCase();
  if (!restore && spec.platform === "batocera" && !new Set(["AUTO", "VULKAN", "OPENGL"]).has(xboxRenderer)) throw new Error("Choose a supported Xbox renderer.");
  const xboxVideoMode = String(values.xboxVideoMode || "AUTO").toUpperCase() === "720P" ? "1280x720" : String(values.xboxVideoMode || "AUTO");
  if (!restore && spec.platform === "batocera" && !new Set(["AUTO", "1280x720"]).has(xboxVideoMode)) throw new Error("Choose a supported Xbox display resolution.");
  const wifiPowerSaver = values.wifiPowerSaver === true;
  return sftpWithDevice(device, async (sftp, client) => {
    let content = await readSftpFile(sftp, spec.path).catch(() => spec.kind === "emulationstation" ? '<?xml version="1.0"?>\n<config>\n</config>\n' : "");
    let batoceraConfig = spec.platform === "batocera" ? await readSftpFile(sftp, "/userdata/system/batocera.conf").catch(() => "") : "";
    let customSh = spec.platform === "batocera" ? await readSftpFile(sftp, "/userdata/system/custom.sh").catch(() => "") : "";
    const currentWifiPowerState = spec.platform === "batocera" ? await execOnSshClient(client, "iw dev wlan0 get power_save 2>/dev/null || true", 5000) : "";
    let appliedWifiPowerSaver = wifiPowerSaver;
    const state = readMachineBehaviorState();
    const identity = softResetMachineIdentity(deviceName);
    if (!state[identity]) {
      state[identity] = spec.kind === "emulationstation" ? {
        ScreenSaverTime: xmlSetting(content, "ScreenSaverTime"), SystemSleepTime: xmlSetting(content, "SystemSleepTime"),
        ScreenSaverBehavior: xmlSetting(content, "ScreenSaverBehavior"), PowerSaverMode: xmlSetting(content, "PowerSaverMode"),
        XboxRenderer: spec.platform === "batocera" ? batoceraSetting(batoceraConfig, "xbox.xemu_api") : null,
        XboxVideoMode: spec.platform === "batocera" ? batoceraSetting(batoceraConfig, "xbox.videomode") : null,
        WifiPowerSaver: spec.platform === "batocera" ? /power save:\s*on/i.test(currentWifiPowerState) : null
      } : { menu_screensaver_timeout: retroarchSetting(content, "menu_screensaver_timeout") };
      writeMachineBehaviorState(state);
    } else if (spec.platform === "batocera" && (!Object.hasOwn(state[identity], "XboxVideoMode") || !Object.hasOwn(state[identity], "WifiPowerSaver"))) {
      // Existing restore snapshots predate this control. Preserve the machine's
      // current video mode as the restore baseline instead of deleting it.
      state[identity].XboxVideoMode = batoceraSetting(batoceraConfig, "xbox.videomode");
      state[identity].WifiPowerSaver = /power save:\s*on/i.test(currentWifiPowerState);
      writeMachineBehaviorState(state);
    }
    if (restore) {
      const original = state[identity];
      if (!original) throw new Error("RP1 has no earlier Machine Behavior settings saved for this machine.");
      if (spec.kind === "emulationstation") {
        for (const [name, type] of [["ScreenSaverTime", "int"], ["SystemSleepTime", "int"], ["ScreenSaverBehavior", "string"], ["PowerSaverMode", "string"]]) {
          content = original[name] == null ? removeXmlSetting(content, name) : setXmlSetting(content, type, name, original[name]);
        }
        if (spec.platform === "batocera") {
          appliedWifiPowerSaver = original.WifiPowerSaver !== false;
          batoceraConfig = original.XboxRenderer == null ? removeBatoceraSetting(batoceraConfig, "xbox.xemu_api") : setBatoceraSetting(batoceraConfig, "xbox.xemu_api", original.XboxRenderer);
          batoceraConfig = original.XboxVideoMode == null ? removeBatoceraSetting(batoceraConfig, "xbox.videomode") : setBatoceraSetting(batoceraConfig, "xbox.videomode", original.XboxVideoMode);
          customSh = setWifiPowerSaverStartup(customSh, original.WifiPowerSaver !== false);
        }
      } else if (original.menu_screensaver_timeout != null) content = setRetroarchSetting(content, "menu_screensaver_timeout", original.menu_screensaver_timeout);
      else content = String(content).replace(/^\s*menu_screensaver_timeout\s*=.*(?:\r?\n|$)/mi, "");
      delete state[identity];
      writeMachineBehaviorState(state);
    } else if (spec.kind === "emulationstation") {
      content = setXmlSetting(content, "int", "ScreenSaverTime", screenSaverMinutes * 60000);
      content = setXmlSetting(content, "int", "SystemSleepTime", systemSleepMinutes * 60000);
      content = setXmlSetting(content, "string", "ScreenSaverBehavior", values.behavior);
      content = setXmlSetting(content, "string", "PowerSaverMode", values.powerSaver);
      if (spec.platform === "batocera") {
        batoceraConfig = xboxRenderer === "AUTO" ? removeBatoceraSetting(batoceraConfig, "xbox.xemu_api") : setBatoceraSetting(batoceraConfig, "xbox.xemu_api", xboxRenderer);
        batoceraConfig = xboxVideoMode === "AUTO" ? removeBatoceraSetting(batoceraConfig, "xbox.videomode") : setBatoceraSetting(batoceraConfig, "xbox.videomode", await supportedXbox720Mode(client));
        customSh = setWifiPowerSaverStartup(customSh, wifiPowerSaver);
      }
    } else content = setRetroarchSetting(content, "menu_screensaver_timeout", screenSaverMinutes * 60);
    if (spec.kind === "emulationstation") await execOnSshClient(client, "/etc/init.d/S31emulationstation stop >/dev/null 2>&1 || true", 30000);
    await writeSftpFile(sftp, `${spec.path}.rp1-upload`, content);
    await new Promise(resolve => sftp.unlink(spec.path, () => resolve()));
    await new Promise((resolve, reject) => sftp.rename(`${spec.path}.rp1-upload`, spec.path, error => error ? reject(error) : resolve()));
    if (spec.platform === "batocera") {
      await writeSftpFile(sftp, "/userdata/system/batocera.conf.rp1-upload", batoceraConfig);
      await new Promise(resolve => sftp.unlink("/userdata/system/batocera.conf", () => resolve()));
      await new Promise((resolve, reject) => sftp.rename("/userdata/system/batocera.conf.rp1-upload", "/userdata/system/batocera.conf", error => error ? reject(error) : resolve()));
      await writeSftpFile(sftp, "/userdata/system/custom.sh.rp1-upload", customSh);
      await new Promise(resolve => sftp.unlink("/userdata/system/custom.sh", () => resolve()));
      await new Promise((resolve, reject) => sftp.rename("/userdata/system/custom.sh.rp1-upload", "/userdata/system/custom.sh", error => error ? reject(error) : resolve()));
      await execOnSshClient(client, `chmod 755 /userdata/system/custom.sh; iw dev wlan0 set power_save ${appliedWifiPowerSaver ? "on" : "off"} 2>/dev/null || true`, 5000);
    }
    await execOnSshClient(client, `sync${spec.kind === "emulationstation" ? "; /etc/init.d/S31emulationstation start >/dev/null 2>&1 || true" : ""}`, 30000);
    return {
      supported: true, platform: spec.platform, kind: spec.kind, restored: restore, refreshed: spec.kind === "emulationstation",
      screenSaverMinutes: spec.kind === "retroarch" ? Math.max(0, Math.round(Number(retroarchSetting(content, "menu_screensaver_timeout") || 0) / 60)) : Math.max(0, Math.round(Number(xmlSetting(content, "ScreenSaverTime") || 0) / 60000)),
      systemSleepMinutes: spec.kind === "emulationstation" ? Math.max(0, Math.round(Number(xmlSetting(content, "SystemSleepTime") || 0) / 60000)) : 0,
      behavior: spec.kind === "emulationstation" ? xmlSetting(content, "ScreenSaverBehavior") || "dim" : "black",
      powerSaver: spec.kind === "emulationstation" ? xmlSetting(content, "PowerSaverMode") || "default" : "default",
      xboxRenderer: spec.platform === "batocera" ? String(batoceraSetting(batoceraConfig, "xbox.xemu_api") || "AUTO").toUpperCase() : "AUTO",
      xboxVideoMode: spec.platform === "batocera" ? xboxVideoModeChoice(batoceraSetting(batoceraConfig, "xbox.videomode")) : "AUTO",
      wifiPowerSaver: spec.platform === "batocera" ? appliedWifiPowerSaver : false,
      capabilities: { screenSaverTime: true, systemSleepTime: spec.kind === "emulationstation", behavior: spec.kind === "emulationstation", powerSaver: spec.kind === "emulationstation", xboxRenderer: spec.platform === "batocera", xboxVideoMode: spec.platform === "batocera", wifiPowerSaver: spec.platform === "batocera" }
    };
  });
}

async function getMachineDisplay(device) {
  if (device?.access !== "ssh" || device.platform && device.platform !== "batocera") {
    return { supported: false, reason: "This machine does not expose a compatible performance HUD." };
  }
  return sftpWithDevice(device, async (sftp, client) => {
    const config = await readSftpFile(sftp, "/userdata/system/batocera.conf").catch(() => "");
    const processState = await execOnSshClient(client, "pids=$(pgrep -f '[x]enia|[r]pcs3|[c]emu|[d]olphin|[r]etroarch' || true); if [ -n \"$pids\" ]; then game=1; else game=0; fi; hud=0; for pid in $pids; do if tr '\\0' '\\n' </proc/$pid/environ 2>/dev/null | grep -q -E '^MANGOHUD(_CONFIG|_CONFIGFILE)?='; then hud=1; break; fi; done; echo GAME=$game,HUD=$hud", 10000);
    const hudEnabled = String(batoceraSetting(config, "global.hud") || "").toLowerCase() === "perf";
    const xeniaHudEnabled = String(batoceraSetting(config, "xbox360.hud_support") || "").toLowerCase() === "true";
    return {
      supported: true,
      hud: hudEnabled && xeniaHudEnabled,
      gameRunning: /GAME=1/.test(processState),
      hudAttached: /HUD=1/.test(processState),
      xeniaCompatibilityMode: xeniaHudEnabled
    };
  });
}

async function setMachineDisplay(device, values) {
  if (device?.access !== "ssh" || device.platform && device.platform !== "batocera") {
    throw new Error("This machine does not expose a compatible performance HUD.");
  }
  return sftpWithDevice(device, async (sftp, client) => {
    let config = await readSftpFile(sftp, "/userdata/system/batocera.conf").catch(() => "");
    if (typeof values.hud === "boolean") {
      if (values.hud) {
        config = setBatoceraSetting(config, "global.hud", "perf");
        // Xenia needs the MangoHud wrapper explicitly enabled. Batocera's default
        // console bezel must also be disabled or it becomes a full-screen HUD
        // background that covers the sides of the running game.
        config = setBatoceraSetting(config, "xbox360.hud_support", "true");
        config = setBatoceraSetting(config, "xbox360.bezel", "none");
      } else {
        config = removeBatoceraSetting(config, "global.hud");
        config = removeBatoceraSetting(config, "xbox360.hud_support");
        config = removeBatoceraSetting(config, "xbox360.bezel");
      }
    }
    const temporary = "/userdata/system/batocera.conf.rp1-display";
    await writeSftpFile(sftp, temporary, config);
    await new Promise(resolve => sftp.unlink("/userdata/system/batocera.conf", () => resolve()));
    await new Promise((resolve, reject) => sftp.rename(temporary, "/userdata/system/batocera.conf", error => error ? reject(error) : resolve()));
    const processState = await execOnSshClient(client, "sync; pids=$(pgrep -f '[x]enia|[r]pcs3|[c]emu|[d]olphin|[r]etroarch' || true); if [ -n \"$pids\" ]; then game=1; else game=0; fi; attached=0; for pid in $pids; do if tr '\\0' '\\n' </proc/$pid/environ 2>/dev/null | grep -q -E '^MANGOHUD(_CONFIG|_CONFIGFILE)?='; then attached=1; break; fi; done; echo GAME=$game,HUD=$attached", 10000);
    const gameRunning = /GAME=1/.test(processState);
    const hudAttached = /HUD=1/.test(processState);
    return {
      supported: true,
      hud: String(batoceraSetting(config, "global.hud") || "").toLowerCase() === "perf",
      gameRunning,
      hudAttached,
      requiresRelaunch: gameRunning
    };
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseAlbumFolder(folderName) {
  const match = String(folderName).match(/^(.+?)\s+-\s+(?:(\d{4})\s+-\s+)?(.+)$/);
  if (!match) return { artist: "", year: "", album: folderName };
  return { artist: match[1].trim(), year: match[2] || "", album: match[3].trim() };
}

function musicBrainzQueryValue(value) {
  return String(value || "").replace(/([+\-&|!(){}\[\]^"~*?:\\/])/g, "\\$1");
}

async function findMusicBrainzAlbum(albumFolder) {
  const parsed = parseAlbumFolder(albumFolder);
  const terms = [`releasegroup:\"${musicBrainzQueryValue(parsed.album)}\"`];
  if (parsed.artist) terms.push(`artist:\"${musicBrainzQueryValue(parsed.artist)}\"`);
  if (parsed.year) terms.push(`firstreleasedate:${parsed.year}`);
  const params = new URLSearchParams({ query: terms.join(" AND "), fmt: "json", limit: "5" });
  const response = await fetch(`https://musicbrainz.org/ws/2/release-group/?${params}`, {
    headers: { "User-Agent": "BatoceraWarehouse/1.0 (personal desktop music organizer)" }
  });
  if (!response.ok) throw new Error(`MusicBrainz returned HTTP ${response.status}`);
  const data = await response.json();
  const result = (data["release-groups"] || [])[0];
  if (!result || Number(result.score || 0) < 70) return null;
  return {
    musicbrainzReleaseGroupId: result.id,
    title: result.title || parsed.album,
    artist: result["artist-credit"]?.map(entry => entry.name || entry.artist?.name).filter(Boolean).join("") || parsed.artist,
    firstReleaseDate: result["first-release-date"] || parsed.year,
    primaryType: result["primary-type"] || "Album",
    secondaryTypes: result["secondary-types"] || [],
    score: Number(result.score || 0),
    source: "MusicBrainz"
  };
}

async function downloadCoverArt(releaseGroupId) {
  const response = await fetch(`https://coverartarchive.org/release-group/${encodeURIComponent(releaseGroupId)}/front-500`, {
    headers: { "User-Agent": "BatoceraWarehouse/1.0 (personal desktop music organizer)" },
    redirect: "follow"
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Cover Art Archive returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return null;
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > 12 * 1024 * 1024) throw new Error("Album artwork is unexpectedly large.");
  return data;
}

async function mirrorMusicMetadata(device, folderName, metadata, artwork) {
  if (!device) return;
  await sftpWithDevice(device, async sftp => {
    const remoteDir = `/userdata/music/${folderName.replace(/[\\/]/g, "_")}`;
    await mkdirpSftp(sftp, remoteDir);
    await writeSftpFile(sftp, `${remoteDir}/musicbrainz.json`, JSON.stringify(metadata, null, 2));
    if (artwork) await writeSftpFile(sftp, `${remoteDir}/folder.jpg`, artwork);
  });
}

async function runMusicScrape(device, overwrite) {
  const musicRoot = path.join(root, localFolders.music);
  const albums = fs.existsSync(musicRoot)
    ? fs.readdirSync(musicRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
    : [];
  musicScrapeJob = { running: true, total: albums.length, processed: 0, matched: 0, artwork: 0, skipped: 0, errors: [], current: "", finishedAt: "" };

  for (const folderName of albums) {
    musicScrapeJob.current = folderName;
    const albumPath = path.join(musicRoot, folderName);
    const metadataPath = path.join(albumPath, "musicbrainz.json");
    try {
      if (!overwrite && fs.existsSync(metadataPath)) {
        musicScrapeJob.skipped += 1;
        musicScrapeJob.processed += 1;
        continue;
      }
      const metadata = await findMusicBrainzAlbum(folderName);
      if (!metadata) {
        musicScrapeJob.errors.push(`${folderName}: no confident MusicBrainz match`);
        musicScrapeJob.processed += 1;
        await wait(1100);
        continue;
      }
      const artwork = await downloadCoverArt(metadata.musicbrainzReleaseGroupId);
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      if (artwork) fs.writeFileSync(path.join(albumPath, "folder.jpg"), artwork);
      await mirrorMusicMetadata(device, folderName, metadata, artwork);
      musicScrapeJob.matched += 1;
      if (artwork) musicScrapeJob.artwork += 1;
    } catch (error) {
      musicScrapeJob.errors.push(`${folderName}: ${error.message}`);
    }
    musicScrapeJob.processed += 1;
    await wait(1100);
  }
  musicScrapeJob.running = false;
  musicScrapeJob.current = "";
  musicScrapeJob.finishedAt = new Date().toISOString();
}

function xmlAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setEsString(xml, name, value) {
  const entry = `\t<string name="${name}" value="${xmlAttribute(value)}" />`;
  const pattern = new RegExp(`\\s*<string\\s+name="${name}"\\s+value="[^"]*"\\s*/>`);
  if (pattern.test(xml)) return xml.replace(pattern, `\n${entry}`);
  return xml.replace(/\s*<\/config>\s*$/, `\n${entry}\n</config>\n`);
}

function setEsBool(xml, name, value) {
  const entry = `\t<bool name="${name}" value="${value ? "true" : "false"}" />`;
  const pattern = new RegExp(`\\s*<bool\\s+name="${name}"\\s+value="(?:true|false)"\\s*/>`, "i");
  if (pattern.test(xml)) return xml.replace(pattern, `\n${entry}`);
  return xml.replace(/\s*<\/config>\s*$/, `\n${entry}\n</config>\n`);
}

async function disableGenericBiosLaunchWarning(device) {
  const settingsPath = "/userdata/system/configs/emulationstation/es_settings.cfg";
  return sftpWithDevice(device, async (sftp, client) => {
    let current = "";
    try { current = await readSftpFile(sftp, settingsPath); } catch {}
    if (/\<bool\s+name="CheckBiosesAtLaunch"\s+value="false"\s*\/\>/i.test(current)) {
      return { changed: false, checkBiosesAtLaunch: false };
    }
    await execOnSshClient(client, "/etc/init.d/S31emulationstation stop >/dev/null 2>&1 || true");
    try {
      try { current = await readSftpFile(sftp, settingsPath); } catch { current = "<config>\n</config>\n"; }
      await writeSftpFile(sftp, settingsPath, setEsBool(current, "CheckBiosesAtLaunch", false));
      await execOnSshClient(client, "sync");
    } finally {
      await execOnSshClient(client, "/etc/init.d/S31emulationstation start >/dev/null 2>&1 || true");
    }
    return { changed: true, checkBiosesAtLaunch: false };
  });
}

async function saveScraperConfig(device, body) {
  const existing = readScraperSettings();
  const providers = {
    thispc: "This PC",
    coverproject: "The Cover Project",
    screenscraper: "ScreenScraper",
    thegamesdb: "TheGamesDB",
    arcadedb: "ArcadeDB",
    igdb: "IGDB"
  };
  const provider = providers[String(body.provider || "").toLowerCase()];
  const screenUser = String(body.username || existing.screenScraperUsername || "").trim();
  const screenPass = String(body.password || existing.screenScraperPassword || "");
  const screenDevId = String(body.devId || existing.screenScraperDevId || "").trim();
  const screenDevPassword = String(body.devPassword || existing.screenScraperDevPassword || "");
  const screenSoftName = String(body.softName || existing.screenScraperSoftName || "Ready Player One").trim();
  const igdbId = String(body.clientId || existing.igdbClientId || "").trim();
  const igdbSecret = String(body.clientSecret || existing.igdbClientSecret || "");
  const gamesDbKey = String(body.apiKey || existing.theGamesDbApiKey || "").trim();
  if (!provider) throw new Error("Choose a supported scraper provider.");
  if (provider === "ScreenScraper" && (!screenUser || !screenPass || !screenDevId || !screenDevPassword)) {
    throw new Error("ScreenScraper requires your username, password, developer ID, and developer password.");
  }
  if (provider === "IGDB" && (!igdbId || !igdbSecret)) {
    throw new Error("IGDB client ID and client secret are required.");
  }
  if (provider === "TheGamesDB" && !gamesDbKey) {
    throw new Error("TheGamesDB API key is required for Warehouse scraping.");
  }

  fs.writeFileSync(scraperSettingsPath, JSON.stringify({
    provider,
    screenScraperUsername: provider === "ScreenScraper" ? screenUser : existing.screenScraperUsername || "",
    screenScraperPassword: provider === "ScreenScraper" ? screenPass : existing.screenScraperPassword || "",
    screenScraperDevId: provider === "ScreenScraper" ? screenDevId : existing.screenScraperDevId || "",
    screenScraperDevPassword: provider === "ScreenScraper" ? screenDevPassword : existing.screenScraperDevPassword || "",
    screenScraperSoftName: provider === "ScreenScraper" ? screenSoftName : existing.screenScraperSoftName || "Ready Player One",
    igdbClientId: provider === "IGDB" ? igdbId : existing.igdbClientId || "",
    igdbClientSecret: provider === "IGDB" ? igdbSecret : existing.igdbClientSecret || "",
    theGamesDbApiKey: provider === "TheGamesDB" ? gamesDbKey : existing.theGamesDbApiKey || "",
    savedAt: new Date().toISOString()
  }, null, 2), { mode: 0o600 });

  if (provider === "This PC" || provider === "The Cover Project") return { provider };

  const settingsPath = "/userdata/system/configs/emulationstation/es_settings.cfg";
  return sftpWithDevice(device, async (sftp, client) => {
    let xml = await readSftpFile(sftp, settingsPath);
    xml = setEsString(xml, "Scraper", provider);
    if (provider === "ScreenScraper") {
      xml = setEsString(xml, "ScreenScraperUser", screenUser);
      xml = setEsString(xml, "ScreenScraperPass", screenPass);
    }
    if (provider === "IGDB") {
      xml = setEsString(xml, "IGDBClientID", igdbId);
      xml = setEsString(xml, "IGDBSecret", igdbSecret);
    }

    await execOnSshClient(client, "/etc/init.d/S31emulationstation stop >/dev/null 2>&1 || true");
    try {
      await writeSftpFile(sftp, settingsPath, xml);
    } finally {
      await execOnSshClient(client, "/etc/init.d/S31emulationstation start >/dev/null 2>&1 || true");
    }
    return { provider };
  });
}

const theGamesDbPlatformIds = {
  mame: 23, nes: 7, snes: 6, sega: 18, gba: 5, ps1: 10, ps2: 11, ps3: 12, n64: 3
};
const igdbPlatformIds = { mame: 52, nes: 18, snes: 19, sega: 29, gba: 24, ps1: 131, ps2: 8, ps3: 9, n64: 4 };
const screenScraperPlatformIds = { mame: 75, nes: 3, snes: 4, sega: 1, gba: 12, ps1: 57, ps2: 58, ps3: 59, n64: 14 };
let igdbTokenCache = { token: "", expiresAt: 0 };

function readScraperSettings() {
  try { return JSON.parse(fs.readFileSync(scraperSettingsPath, "utf8")); } catch { return {}; }
}

function xmlText(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function fetchTheGamesDbIpv4(url, signal, redirects = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || redirects > 4) return reject(new Error('Invalid artwork redirect.'));
    const request = require('node:https').get(parsed, {family:4, agent:false, signal,
      headers:{'User-Agent':'Batocera-Warehouse/1.0'}}, response => {
      if ([301,302,303,307,308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        resolve(fetchTheGamesDbIpv4(new URL(response.headers.location, parsed).href, signal, redirects + 1));
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 32 * 1024 * 1024) { response.destroy(new Error('Provider response exceeds 32 MB.')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve(new Response([204,304].includes(response.statusCode) ? null : Buffer.concat(chunks),
        {status:response.statusCode, headers:response.headers})));
    });
    request.on('error', reject);
  });
}

async function fetchWithLimit(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const host = new URL(url).hostname;
    const response = (host === 'thegamesdb.net' || host.endsWith('.thegamesdb.net')) && (!options.method || options.method === 'GET')
      ? await fetchTheGamesDbIpv4(url, controller.signal)
      : await fetch(url, { ...options, signal: controller.signal, headers: { "User-Agent": "Batocera-Warehouse/1.0", ...(options.headers || {}) } });
    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.clone().json();
        detail = String(body.status || body.message || body.error || "").trim();
      } catch {
        try { detail = (await response.clone().text()).trim().slice(0, 180); } catch { /* no response body */ }
      }
      throw new Error(detail || `Provider returned HTTP ${response.status}.`);
    }
    return response;
  } catch (error) {
    const cause = error.cause;
    const codes = [cause?.code, ...(cause?.errors || []).map(item => item.code)].filter(Boolean);
    if (codes.length) throw new Error(`${new URL(url).hostname}: ${error.message} (${[...new Set(codes)].join(', ')})`);
    throw error;
  } finally { clearTimeout(timer); }
}

function theGamesDbImageUrl(payload, gameId) {
  const boxart = payload?.include?.boxart;
  const files = boxart?.data?.[String(gameId)] || boxart?.data?.[gameId] || [];
  const chosen = files.find(item => item.side === "front") || files[0];
  if (!chosen?.filename) return "";
  const base = boxart?.base_url?.original || boxart?.base_url?.large || boxart?.base_url?.medium || "";
  return base ? `${base.replace(/\/$/, "")}/${chosen.filename.replace(/^\//, "")}` : chosen.filename;
}

async function scrapeTheGamesDb(settings, system, fileName) {
  const key = String(settings.theGamesDbApiKey || "").trim();
  if (!key) throw new Error("TheGamesDB API key is not saved.");
  const params = new URLSearchParams({
    apikey: key,
    fields: "players,publishers,genres,overview,rating,platform,developers,release_date",
    include: "boxart",
    name: cleanRomName(fileName)
  });
  const platform = theGamesDbPlatformIds[system];
  if (platform) params.set("filter[platform]", String(platform));
  const response = await fetchWithLimit(`https://api.thegamesdb.net/v1/Games/ByGameName?${params}`);
  const payload = await response.json();
  const game = payload?.data?.games?.[0];
  if (!game) return null;
  return {
    name: game.game_title || cleanRomName(fileName),
    desc: game.overview || "",
    releasedate: String(game.release_date || "").replace(/-/g, "").slice(0, 8),
    rating: game.rating ? String(Math.min(1, Number(game.rating) / 10)) : "",
    players: game.players ? String(game.players) : "",
    imageUrl: theGamesDbImageUrl(payload, game.id),
    providerId: String(game.id), provider: "TheGamesDB"
  };
}

async function ensureIgdbToken(settings) {
  if (igdbTokenCache.token && igdbTokenCache.expiresAt > Date.now() + 60000) return igdbTokenCache.token;
  const params = new URLSearchParams({ client_id: settings.igdbClientId || "", client_secret: settings.igdbClientSecret || "", grant_type: "client_credentials" });
  const response = await fetchWithLimit(`https://id.twitch.tv/oauth2/token?${params}`, { method: "POST" });
  const payload = await response.json();
  if (!payload.access_token) throw new Error("IGDB credentials were rejected.");
  igdbTokenCache = { token: payload.access_token, expiresAt: Date.now() + Number(payload.expires_in || 1800) * 1000 };
  return igdbTokenCache.token;
}

async function scrapeIgdb(settings, system, fileName) {
  const token = await ensureIgdbToken(settings);
  const clean = cleanRomName(fileName).replace(/["\\]/g, " ");
  const platform = igdbPlatformIds[system];
  const body = `fields id,name,summary,first_release_date,aggregated_rating,cover.image_id; search "${clean}";${platform ? ` where platforms = (${platform});` : ""} limit 1;`;
  const response = await fetchWithLimit("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: { "Client-ID": settings.igdbClientId, Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    body
  });
  const game = (await response.json())?.[0];
  if (!game) return null;
  const date = game.first_release_date ? new Date(game.first_release_date * 1000).toISOString().slice(0, 10).replace(/-/g, "") : "";
  return { name: game.name || clean, desc: game.summary || "", releasedate: date, rating: game.aggregated_rating ? String(Number(game.aggregated_rating) / 100) : "", players: "", imageUrl: game.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_original/${game.cover.image_id}.jpg` : "", providerId: String(game.id), provider: "IGDB" };
}

async function scrapeArcadeDb(system, fileName) {
  if (system !== "mame") throw new Error("ArcadeDB supports MAME/arcade ROMs only.");
  const name = path.basename(fileName, path.extname(fileName)).replace(/[ .]/g, "");
  const response = await fetchWithLimit(`http://adb.arcadeitalia.net/service_scraper.php?ajax=query_mame&lang=en&use_parent=1&game_name=${encodeURIComponent(name)}`);
  const game = (await response.json())?.result?.[0];
  if (!game) return null;
  return { name: game.title || cleanRomName(fileName), desc: game.history || "", releasedate: game.year ? `${game.year}0101` : "", rating: "", players: game.players ? String(game.players) : "", imageUrl: game.url_image_ingame || game.url_image_flyer || "", providerId: game.game_name || name, provider: "ArcadeDB" };
}

function decodeXmlText(value) {
  return String(value || "").replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}

function firstXmlTag(xml, tag) {
  return decodeXmlText(xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "");
}

async function scrapeScreenScraper(settings, system, fileName) {
  if (!settings.screenScraperDevId || !settings.screenScraperDevPassword) throw new Error("ScreenScraper direct scraping requires a registered developer ID and developer password in addition to the account login.");
  const params = new URLSearchParams({ devid: settings.screenScraperDevId, devpassword: settings.screenScraperDevPassword, softname: settings.screenScraperSoftName || "Ready Player One", output: "xml", romnom: path.basename(fileName), systemeid: String(screenScraperPlatformIds[system] || ""), ssid: settings.screenScraperUsername || "", sspassword: settings.screenScraperPassword || "" });
  const response = await fetchWithLimit(`https://api.screenscraper.fr/api2/jeuInfos.php?${params}`, {}, 25000);
  const xml = await response.text();
  const gameXml = xml.match(/<jeu(?:\s[^>]*)?>([\s\S]*?)<\/jeu>/i)?.[0];
  if (!gameXml) return null;
  const mediaMatches = [...gameXml.matchAll(/<media\s+([^>]*)>([\s\S]*?)<\/media>/gi)];
  const media = preferred => decodeXmlText((mediaMatches.find(match => new RegExp(`type=["']${preferred}["']`, "i").test(match[1])) || [])[2] || "");
  const date = firstXmlTag(gameXml, "date").replace(/[^0-9]/g, "").slice(0, 8);
  return { name: firstXmlTag(gameXml, "nom") || cleanRomName(fileName), desc: firstXmlTag(gameXml, "synopsis"), releasedate: date, rating: "", players: firstXmlTag(gameXml, "joueurs"), imageUrl: media("mixrbv2") || media("ss") || media("box-2D"), providerId: gameXml.match(/<jeu[^>]*id=["']([^"']+)/i)?.[1] || "", provider: "ScreenScraper" };
}

function localCoverKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// These systems have a deliberately closed artwork pipeline. Their game art
// may come only from covers/<system>; a missing match must use RP1's generated
// default. Keeping this policy in one place prevents a newly-added transfer
// path from silently falling back to a website or older cached artwork.
const localOnlyArtworkSystems = new Set([
  "mame", "nes", "3dsen", "snes", "sega", "gba", "ps1", "ps2", "ps3", "ps4", "n64",
  "gb", "gbc", "nds", "3ds", "gamecube", "wii", "wiiu", "switch", "mastersystem",
  "gamegear", "segacd", "saturn", "dreamcast", "psp", "psvita", "xbox", "xbox360",
  "neogeo", "atari2600", "atari5200", "atari7800", "atarilynx", "xegs", "jaguar", "jaguarcd",
  "atari800", "atarist", "pcengine", "dos"
]);
const styledFallbackArtworkSystems = new Set([
  "nes", "snes", "gba", "n64", "gamecube", "wii", "wiiu", "ps1", "ps2", "ps3", "ps4", "xbox", "xbox360", "mame"
]);

function usesLocalOnlyArtwork(system) {
  return localOnlyArtworkSystems.has(system);
}

function localCoverTitleKeys(value) {
  const cleaned = cleanRomName(value).replace(/(?:front|picture|label|cover|boxart|box|artwork|image)$/i, "").trim();
  // Artwork packs often append an edition label that is absent from the ROM
  // folder (for example, "Need for Speed Hot Pursuit Remastered"). Keep the
  // exact key, and add a conservative suffix-free key for those editions.
  const withoutEdition = cleaned.replace(/\s+(?:remaster(?:ed)?|definitive edition|complete edition|game of the year edition|goty edition|gold edition|deluxe edition|ultimate edition)$/i, "").trim();
  const singularized = withoutEdition.split(/\s+/).map(word =>
    /[a-z]{4,}s$/i.test(word) && !/(?:ss|us|is)$/i.test(word) ? word.slice(0, -1) : word
  ).join(" ");
  // Never reduce a title to the text before the first " - ". Franchises such
  // as "Legend of Zelda, The - ..." share that prefix, which made different
  // games resolve to whichever franchise image appeared first in the folder.
  const titles = [cleaned, withoutEdition, singularized].filter(Boolean);
  const keys = new Set();
  for (const title of titles) {
    keys.add(localCoverKey(title));
    const reversedArticle = title.match(/^(.+),\s*(a|an|the)$/i);
    if (reversedArticle) keys.add(localCoverKey(`${reversedArticle[2]} ${reversedArticle[1]}`));
  }
  return keys;
}

const localCoverIndexCache = new Map();
async function listLocalCoverFiles(directory, extensions, base = directory) {
  let entries = [];
  try { entries = await fs.promises.readdir(directory, { withFileTypes: true }); }
  catch { return []; }
  const groups = await Promise.all(entries.map(async entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listLocalCoverFiles(absolute, extensions, base);
    if (!entry.isFile() || !extensions.has(path.extname(entry.name).toLowerCase())) return [];
    return [path.relative(base, absolute).replace(/\\/g, "/")];
  }));
  return groups.flat();
}

async function findLocalConsoleCover(system, fileName) {
  if (system === "3dsen") system = "nes";
  const coversRoot = path.join(root, "covers");
  if (!fs.existsSync(coversRoot)) return "";
  const systemKeys = [system, systemFolders[system], systemLabels[system]].map(localCoverKey).filter(Boolean);
  const systemDir = (await fs.promises.readdir(coversRoot, { withFileTypes: true }))
    .find(entry => entry.isDirectory() && systemKeys.includes(localCoverKey(entry.name)));
  if (!systemDir) return "";
  const gameKeys = localCoverTitleKeys(fileName);
  const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
  const coverDirectory = path.join(coversRoot, systemDir.name);
  const cacheKey = `${system}\u0000${coverDirectory}`;
  const cachedIndex = localCoverIndexCache.get(cacheKey);
  let orderedFiles = cachedIndex && Date.now() - cachedIndex.at < 600000
    ? cachedIndex.files
    : (await listLocalCoverFiles(coverDirectory, imageExtensions))
      .filter(name => !/^defgame(?:\.[^.]+)?$/i.test(path.basename(name)))
      .map(name => ({ name, baseName: path.basename(name) }));
  if (!cachedIndex || Date.now() - cachedIndex.at >= 600000) orderedFiles = [...orderedFiles].sort((a, b) => {
    // NES/SNES cartridge packs are the canonical artwork. Old Cover Project
    // files such as "Solomon's Key front.jpg" may still be present from an
    // earlier RP1 version; never let that descriptor make legacy box/front
    // art outrank the complete transparent cartridge PNG.
    const preferred = entry => {
      const legacyDescriptor = /(?:front|picture|label|cover|boxart|box|artwork|image)(?:\.[^.]+)?$/i.test(entry.baseName);
      if (["nes", "snes"].includes(system)) {
        if (legacyDescriptor) return 3;
        if (path.extname(entry.baseName).toLowerCase() === ".png") return 0;
        return 1;
      }
      return legacyDescriptor ? 0 : 1;
    };
    return preferred(a) - preferred(b) || a.name.localeCompare(b.name);
  }).map(entry => ({ ...entry, titleKeys: [...localCoverTitleKeys(entry.baseName)] }));
  if (!cachedIndex || Date.now() - cachedIndex.at >= 600000) {
    localCoverIndexCache.set(cacheKey, { at: Date.now(), files: orderedFiles });
  }
  const match = orderedFiles.find(entry => {
    // Use the same cleanup as ROM names so region/revision suffixes such as
    // "(USA)" do not prevent a local cartridge image from matching.
    const coverKeys = new Set(entry.titleKeys || localCoverTitleKeys(entry.baseName));
    for (const coverKey of [...coverKeys]) {
      for (const systemKey of systemKeys) {
        if (coverKey.startsWith(systemKey)) coverKeys.add(coverKey.slice(systemKey.length));
      }
    }
    return [...coverKeys].some(key => gameKeys.has(key));
  });
  return match ? path.join(coverDirectory, match.name) : "";
}

function hasLocalConsoleCoverFolder(system) {
  if (system === "3dsen") system = "nes";
  const coversRoot = path.join(root, "covers");
  if (!fs.existsSync(coversRoot)) return false;
  const systemKeys = [system, systemFolders[system], systemLabels[system]].map(localCoverKey).filter(Boolean);
  return fs.readdirSync(coversRoot, { withFileTypes: true })
    .some(entry => entry.isDirectory() && systemKeys.includes(localCoverKey(entry.name)));
}

async function clearLegacyNintendoArtwork(device, systems) {
  const targets = systems.filter(system => ["nes", "snes"].includes(system));
  if (!targets.length) return;
  await restoreLegacyRp1SystemCarousel(device);
  for (const system of targets) {
    fs.rmSync(path.join(root, "scraper-cache", system), { recursive: true, force: true });
    fs.mkdirSync(path.join(root, "scraper-cache", system), { recursive: true });
  }
  const script = `import os, shutil, xml.etree.ElementTree as ET\nsystems=${JSON.stringify(targets)}\nfor system in systems:\n root='/userdata/roms/'+system\n gamelist=os.path.join(root,'gamelist.xml')\n if os.path.exists(gamelist):\n  tree=ET.parse(gamelist); changed=False\n  for game in tree.getroot().findall('game'):\n   for tag in ('image','thumbnail','marquee'):\n    node=game.find(tag)\n    if node is not None: game.remove(node); changed=True\n  if changed:\n   temporary=gamelist+'.rp1-clean'\n   tree.write(temporary,encoding='utf-8',xml_declaration=True); os.replace(temporary,gamelist)\n images=os.path.join(root,'media','images')\n shutil.rmtree(images,ignore_errors=True); os.makedirs(images,exist_ok=True)\n theme=os.path.join(root,'theme.xml')\n if os.path.exists(theme):\n  text=open(theme,encoding='utf-8',errors='ignore').read()\n  if 'READY PLAYER ONE NES CARTRIDGE' in text or 'READY PLAYER ONE SNES CARTRIDGE' in text: os.remove(theme)\n selector=os.path.join(root,'media','rp1-'+system+'-selector.png')\n if os.path.exists(selector): os.remove(selector)\nsettings='/userdata/system/configs/emulationstation/es_settings.cfg'\nif os.path.exists(settings):\n tree=ET.parse(settings); top=tree.getroot(); changed=False\n for node in list(top):\n  if node.get('name') in [s+'.defaultView' for s in systems]: top.remove(node); changed=True\n if changed: tree.write(settings,encoding='unicode',xml_declaration=True)`;
  await execSsh(device, `python -c ${shellSingleQuoted(script)}`, 60000);
}

async function restoreLegacyRp1SystemCarousel(device) {
  const script = `import os, xml.etree.ElementTree as ET
settings='/userdata/system/configs/emulationstation/es_settings.cfg'
if os.path.exists(settings):
 tree=ET.parse(settings); root=tree.getroot(); node=next((n for n in root if n.get('name')=='subset.systembackground'),None)
 if node is None: node=ET.SubElement(root,'string',{'name':'subset.systembackground'})
 # Carbon calls its random ROM-fanart background "consoles". The centered
 # hardware artwork the user expects is the "mini-consoles" subset.
 node.set('value','mini-consoles'); tree.write(settings,encoding='unicode',xml_declaration=True)`;
  await execSsh(device, `python -c ${shellSingleQuoted(script)}`, 30000);
}

async function installNintendoPicturePresentation(device, systems) {
  // Per-game art must remain inside the game grid; keep the system carousel
  // on the theme's centered console-hardware artwork.
  await restoreLegacyRp1SystemCarousel(device);
  for (const system of systems.filter(value => ["nes", "snes", "gba", "n64", "gamecube", "wii", "wiiu", "ps1", "ps2", "ps3", "ps4", "xbox", "xbox360", "mame"].includes(value))) {
    const folder = systemFolders[system] || system;
    await uploadNintendoPictureSelector(device, system);
    const factory = system === "nes" ? require("./nes-cartridge-theme")
      : system === "snes" ? require("./snes-cartridge-theme")
      : system === "gba" ? require("./gba-cartridge-theme")
      : system === "mame" ? require("./mame-box-theme")
      : base => require("./local-media-theme")(base, system);
    const command = `settings=/userdata/system/configs/emulationstation/es_settings.cfg
theme_set=$(sed -n 's/.*name="ThemeSet" value="\\([^"]*\\)".*/\\1/p' "$settings" | head -n 1)
base=""
if [ -n "$theme_set" ]; then
  for candidate in "/userdata/themes/$theme_set/${folder}/theme.xml" "/userdata/themes/$theme_set/theme.xml" "/usr/share/emulationstation/themes/$theme_set/${folder}/theme.xml" "/usr/share/emulationstation/themes/$theme_set/theme.xml" "/etc/emulationstation/themes/$theme_set/${folder}/theme.xml" "/etc/emulationstation/themes/$theme_set/theme.xml"; do [ -f "$candidate" ] && { base="$candidate"; break; }; done
fi
if [ -z "$base" ]; then
  for themes_root in /userdata/themes /usr/share/emulationstation/themes /etc/emulationstation/themes; do
    [ -d "$themes_root" ] || continue
    for theme_dir in "$themes_root"/*; do
      [ -d "$theme_dir" ] || continue
      candidate="$theme_dir/${folder}/theme.xml"
      [ -f "$candidate" ] && { base="$candidate"; break 2; }
    done
  done
fi
if [ -z "$base" ]; then
  for themes_root in /userdata/themes /usr/share/emulationstation/themes /etc/emulationstation/themes; do
    [ -d "$themes_root" ] || continue
    for candidate in "$themes_root"/*/theme.xml; do [ -f "$candidate" ] && { base="$candidate"; break 2; }; done
  done
fi
[ -n "$base" ] || { echo "No installed EmulationStation theme could be used for ${folder}" >&2; exit 1; }
cat > /userdata/roms/${folder}/theme.xml <<EOF
${factory('$base')}
EOF
python - <<'PY'
import xml.etree.ElementTree as ET
p='/userdata/system/configs/emulationstation/es_settings.cfg'; t=ET.parse(p); r=t.getroot(); name='${folder}.defaultView'
n=next((x for x in r if x.get('name')==name),None)
if n is None: n=ET.SubElement(r,'string',{'name':name})
n.set('value','RP1Pictures'); t.write(p,encoding='unicode',xml_declaration=True)
PY`;
    await execSsh(device, command, 30000);
    const installed = await execSsh(device, `cat /userdata/roms/${folder}/theme.xml`, 15000);
    if (!installed.includes("<autoLayoutSelectedZoom>1.0</autoLayoutSelectedZoom>") ||
        !installed.includes(`<maxSize>${system === "nes" ? "0.94 0.94" : system === "gba" ? "0.98 0.98" : ["gamecube", "wii", "ps1", "ps2", "ps3", "xbox", "xbox360"].includes(system) ? "1.10 1.10" : system === "wiiu" || system === "mame" ? "1.08 1.08" : system === "ps4" ? "0.98 0.98" : "0.95 0.95"}</maxSize>`) ||
        !installed.includes("<margin>0.001823 0.003241</margin>") ||
        !installed.includes(`<autoLayout>${["nes", "mame", "ps4", "wiiu"].includes(system) ? "6 2" : ["gamecube", "wii", "ps1", "ps2", "ps3", "xbox", "xbox360"].includes(system) ? "5 2" : "4 2"}</autoLayout>`) ||
        !new RegExp(`<padding>${["gamecube", "wii", "ps1", "ps2", "ps3", "xbox", "xbox360"].includes(system) ? "-18 -18" : "0 0"}<\\/padding>\\s*<selectionMode>image<\\/selectionMode>`).test(installed) ||
        !installed.includes(`<cornerSize>${system === "nes" ? "64 64" : system === "snes" ? "11 11" : system === "gba" ? "16 16" : ["gamecube", "wii", "ps1", "ps2", "ps3", "xbox", "xbox360"].includes(system) ? "0 0" : ["ps4", "wiiu"].includes(system) ? "8 8" : "32 32"}</cornerSize><padding>${system === "nes" ? "-8 -8" : ["gamecube", "wii", "ps1", "ps2", "ps3", "xbox", "xbox360"].includes(system) ? "-40 -40" : "-18 -18"}</padding>`) ||
        (installed.match(/<backgroundColor>00000000<\/backgroundColor>/g) || []).length !== 2 ||
        (installed.match(/<selectionMode>image<\/selectionMode>/g) || []).length !== 2 ||
        !installed.includes(`rp1-${system}-selector.png`) ||
        !installed.includes(`<gameImage>/userdata/roms/${folder}/media/rp1-${system}-blank.png</gameImage>`) ||
        !installed.includes('<animateColor>F2C94CFF</animateColor><animateColorTime>720</animateColorTime>') ||
        installed.includes('{game:image}') || installed.includes('<itemTemplate>')) {
      throw new Error(`Ready Player One could not verify the ${system.toUpperCase()} picture layout on ${device.host}.`);
    }
  }
  await installRp1CollectionCoverPresentation(device);
}

async function installRp1CollectionCoverPresentation(device) {
  const factory = require("./collection-cover-theme");
  const collections = [
    { name: "all", folder: "auto-allgames", label: "All Games" },
    { name: "favorites", folder: "auto-favorites", label: "Favorites" }
  ];
  for (const collection of collections) {
    const command = `settings=/userdata/system/configs/emulationstation/es_settings.cfg
theme_set=$(sed -n 's/.*name="ThemeSet" value="\\([^"]*\\)".*/\\1/p' "$settings" | head -n 1)
[ -n "$theme_set" ] || { echo "No active EmulationStation theme is selected" >&2; exit 1; }
target_dir="/userdata/themes/$theme_set/${collection.folder}"
target="$target_dir/theme.xml"
backup="$target_dir/theme.rp1-base.xml"
mkdir -p "$target_dir"
rm -f "$backup"
cat > "$target" <<EOF
${factory('', collection.label)}
EOF
python - <<'PY'
import xml.etree.ElementTree as ET
p='/userdata/system/configs/emulationstation/es_settings.cfg'; t=ET.parse(p); r=t.getroot(); name='${collection.name}.defaultView'
n=next((x for x in r if x.get('name')==name),None)
if n is None: n=ET.SubElement(r,'string',{'name':name})
n.set('value','RP1CollectionCovers'); t.write(p,encoding='unicode',xml_declaration=True)
PY`;
    await execSsh(device, command, 30000);
    const installed = await execSsh(device, `cat /userdata/themes/$(sed -n 's/.*name="ThemeSet" value="\\([^"]*\\)".*/\\1/p' /userdata/system/configs/emulationstation/es_settings.cfg | head -n 1)/${collection.folder}/theme.xml`, 15000);
    if (!installed.includes(`READY PLAYER ONE ${collection.label.toUpperCase()} COVERS`) ||
        !installed.includes('<imageSource>image</imageSource>') ||
        !installed.includes('<autoLayout>5 2</autoLayout>') ||
        !installed.includes('<maxSize>0.88 0.88</maxSize>') ||
        !installed.includes('<padding>-10 -10</padding>') ||
        !installed.includes('<selectionMode>image</selectionMode>')) {
      throw new Error(`Ready Player One could not verify the ${collection.label} cover layout on ${device.host}.`);
    }
  }
}

async function uploadNintendoPictureSelector(device, system) {
  const folder = systemFolders[system] || system;
  const width = 512;
  // NES artwork is a portrait cartridge (roughly 0.9:1), not a square tile.
  // Keeping that aspect ratio preserves the shell and its lower feet.
  const height = system === "nes" ? 568 : 512;
  const selectorPath = path.join(root, "scraper-cache", system, `rp1-${system}-selector.png`);
  const transparentBlankPath = path.join(root, "scraper-cache", system, `rp1-${system}-transparent.png`);
  fs.mkdirSync(path.dirname(selectorPath), { recursive: true });
  const standardShape = "$path.StartFigure();$path.AddArc(24,24,32,32,180,90);$path.AddLine(40,24,472,24);$path.AddArc(456,24,32,32,270,90);$path.AddLine(488,40,488,472);$path.AddArc(456,456,32,32,0,90);$path.AddLine(472,488,40,488);$path.AddArc(24,456,32,32,90,90);$path.AddLine(24,472,24,40);$path.CloseFigure()";
  // SNES intentionally uses one-third of the standard selector curvature.
  // Keep the generated PNG and EmulationStation's nine-patch corner size in
  // agreement so the tighter corners do not stretch or clip at runtime.
  const snesShape = "$path.StartFigure();$path.AddArc(24,24,11,11,180,90);$path.AddLine(30,24,482,24);$path.AddArc(477,24,11,11,270,90);$path.AddLine(488,30,488,482);$path.AddArc(477,477,11,11,0,90);$path.AddLine(482,488,30,488);$path.AddArc(24,477,11,11,90,90);$path.AddLine(24,482,24,30);$path.CloseFigure()";
  // GBA uses half of the standard selector curvature.
  const gbaShape = "$path.StartFigure();$path.AddArc(24,24,16,16,180,90);$path.AddLine(32,24,480,24);$path.AddArc(472,24,16,16,270,90);$path.AddLine(488,32,488,480);$path.AddArc(472,472,16,16,0,90);$path.AddLine(480,488,32,488);$path.AddArc(24,472,16,16,90,90);$path.AddLine(24,480,24,32);$path.CloseFigure()";
  // Match the original NES shell: tall body, lower side steps, and squared
  // cartridge feet. This intentionally is not a rounded square.
  const nesShape = "$path.StartFigure();$path.AddPolygon([System.Drawing.Point[]]@([System.Drawing.Point]::new(18,12),[System.Drawing.Point]::new(494,12),[System.Drawing.Point]::new(500,18),[System.Drawing.Point]::new(500,507),[System.Drawing.Point]::new(488,507),[System.Drawing.Point]::new(488,552),[System.Drawing.Point]::new(24,552),[System.Drawing.Point]::new(24,507),[System.Drawing.Point]::new(12,507),[System.Drawing.Point]::new(12,18)));$path.CloseFigure()";
  const ps4Shape = "$path.StartFigure();$path.AddArc(24,24,8,8,180,90);$path.AddLine(28,24,484,24);$path.AddArc(480,24,8,8,270,90);$path.AddLine(488,28,488,484);$path.AddArc(480,480,8,8,0,90);$path.AddLine(484,488,28,488);$path.AddArc(24,480,8,8,90,90);$path.AddLine(24,484,24,28);$path.CloseFigure()";
  // Match the N64 cartridge silhouette: rounded shoulders rise into the broad
  // curved crown instead of drawing a generic rectangular top edge.
  const n64Shape = "$path.StartFigure();$path.AddArc(24,24,464,100,180,180);$path.AddLine(488,74,488,472);$path.AddArc(456,456,32,32,0,90);$path.AddLine(472,488,40,488);$path.AddArc(24,456,32,32,90,90);$path.AddLine(24,472,24,74);$path.CloseFigure()";
  // Keep the widest glow comfortably inside the PNG. Batocera otherwise
  // clips the outermost pixels, most visibly across the top of disc artwork.
  const wiiShape = "$path.StartFigure();$path.AddEllipse(36,36,440,440);$path.CloseFigure()";
  const shape = system === "nes" ? nesShape : system === "snes" ? snesShape : system === "gba" ? gbaShape : system === "n64" ? n64Shape : ["gamecube", "wii", "ps1", "ps2", "ps3", "xbox", "xbox360"].includes(system) ? wiiShape : ["ps4", "wiiu"].includes(system) ? ps4Shape : standardShape;
  const penWidths = system === "nes" ? [20, 12, 5] : [44, 26, 8];
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    `$canvas=[System.Drawing.Bitmap]::new(${width},${height},[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)`,
    "$graphics=[System.Drawing.Graphics]::FromImage($canvas);$graphics.SmoothingMode='AntiAlias';$graphics.Clear([System.Drawing.Color]::Transparent)",
    "$path=[System.Drawing.Drawing2D.GraphicsPath]::new()", shape,
    `$wide=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(90,255,255,255),${penWidths[0]});$glow=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(180,255,255,255),${penWidths[1]});$edge=[System.Drawing.Pen]::new([System.Drawing.Color]::White,${penWidths[2]})`,
    "$wide.LineJoin='Round';$glow.LineJoin='Round';$edge.LineJoin='Round';$graphics.DrawPath($wide,$path);$graphics.DrawPath($glow,$path);$graphics.DrawPath($edge,$path)",
    `$canvas.Save(${powershellSingleQuoted(selectorPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
    "$edge.Dispose();$glow.Dispose();$wide.Dispose();$path.Dispose();$graphics.Dispose();$canvas.Dispose()"
  ].join(";");
  await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 30000 },
    (error, _stdout, stderr) => error ? reject(new Error(String(stderr || error.message).trim())) : resolve()));
  if (["gamecube", "wii", "ps1", "ps2", "ps3", "xbox", "xbox360"].includes(system)) {
    const blankScript = [
      "Add-Type -AssemblyName System.Drawing",
      "$blank=[System.Drawing.Bitmap]::new(16,16,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
      "$g=[System.Drawing.Graphics]::FromImage($blank);$g.Clear([System.Drawing.Color]::Transparent)",
      `$blank.Save(${powershellSingleQuoted(transparentBlankPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
      "$g.Dispose();$blank.Dispose()"
    ].join(";");
    await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-Command", blankScript], { windowsHide: true, timeout: 30000 },
      (error, _stdout, stderr) => error ? reject(new Error(String(stderr || error.message).trim())) : resolve()));
  }
  await sftpWithDevice(device, async sftp => {
    await mkdirpSftp(sftp, `/userdata/roms/${folder}/media`);
    await fastPutSftp(sftp, selectorPath, `/userdata/roms/${folder}/media/rp1-${system}-selector.png`);
    if (["nes", "snes"].includes(system)) {
      const blankName = system === "snes" ? "defgame1.png" : "defgame.png";
      const blankCartridge = path.join(root, "covers", system, blankName);
      if (!fs.existsSync(blankCartridge)) throw new Error(`Missing local covers/${system}/${blankName} loading image.`);
      await fastPutSftp(sftp, blankCartridge, `/userdata/roms/${folder}/media/rp1-${system}-blank.png`);
    } else if (["gamecube", "wii", "ps1", "ps2", "ps3", "xbox", "xbox360"].includes(system)) {
      // Every ROM already receives either matched local disc art or its own
      // generated fallback in gamelist.xml. A visible grid-level fallback sits
      // behind transparent disc PNGs and creates a second white-disc overlay.
      await fastPutSftp(sftp, transparentBlankPath, `/userdata/roms/${folder}/media/rp1-${system}-blank.png`);
    } else {
      const generated = await cacheNintendoFallbackArtwork(system, system === "n64" ? "Nintendo 64" : system === "gamecube" ? "GameCube" : system === "gba" ? "Game Boy Advance" : system === "ps4" ? "PlayStation 4" : system === "wiiu" ? "Wii U" : system === "mame" ? "Arcade" : "Wii");
      await fastPutSftp(sftp, generated.localPath, `/userdata/roms/${folder}/media/rp1-${system}-blank.png`);
    }
  });
}

async function cacheNintendoFallbackArtwork(system, fileName) {
  const templateName = system === "snes" ? "defgame1.png" : "defgame.png";
  let template = path.join(root, "covers", system, templateName);
  if (system === "nes") {
    const systemFolder = path.join(root, "covers", system);
    const preferredCartridge = path.join(systemFolder, "8 Eyes (USA).png");
    const regularCartridge = fs.existsSync(preferredCartridge) ? preferredCartridge : fs.readdirSync(systemFolder)
      .filter(name => /\.(?:png|jpe?g|webp)$/i.test(name) && !/^defgame(?:\.|$)/i.test(name))
      .map(name => path.join(systemFolder, name))[0];
    if (regularCartridge) template = regularCartridge;
  } else if (["n64", "gamecube", "wii", "wiiu", "ps1", "ps2", "ps3", "ps4", "xbox", "xbox360", "gba", "mame"].includes(system)) {
    const mediaFolder = path.join(root, "covers", system === "ps1" ? "psx" : system);
    const preferredPattern = system === "n64" ? /^1080 Snowboarding .*\.png$/i : system === "gamecube" ? /^007 - Agent Under Fire .*\.png$/i : system === "wiiu" ? /^007 Legends .*\.png$/i : system === "ps1" ? /^007 - The World Is Not Enough .*\.png$/i : system === "ps2" ? /^007 - Agent Under Fire .*\.png$/i : system === "ps3" ? /^007 .*\.png$/i : system === "ps4" ? /^#KILLALLZOMBIES\.png$/i : system === "xbox" ? /^007 .*\.png$/i : system === "xbox360" ? /^007 .*\.png$/i : system === "gba" ? /^007 - Everything or Nothing .*\.png$/i : system === "mame" ? /^1942\.png$/i : /^\$1,000,000 Pyramid, The .*\.png$/i;
    const names = listLocalFilesRecursive(mediaFolder, new Set([".png"]));
    const selected = names.find(name => preferredPattern.test(name)) || names[0];
    if (selected) template = path.join(mediaFolder, selected);
  } else if (system === "snes") {
    const snesFolder = path.join(root, "covers", "snes");
    const preferredCartridge = path.join(snesFolder, "2020 Super Baseball (USA).png");
    const regularCartridge = fs.existsSync(preferredCartridge) ? preferredCartridge : fs.readdirSync(snesFolder)
      .filter(name => /\.(?:png|jpe?g|webp)$/i.test(name) && !/^defgame(?:\.|$)/i.test(name))
      .map(name => path.join(snesFolder, name))[0];
    if (regularCartridge) template = regularCartridge;
  }
  if (!fs.existsSync(template)) throw new Error(`Missing local covers/${system}/${templateName} fallback.`);
  const safe = cleanRomName(fileName).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "game";
  const suffix = crypto.createHash("sha1").update(fileName).digest("hex").slice(0, 8);
  const cacheDir = path.join(root, "scraper-cache", system);
  fs.mkdirSync(cacheDir, { recursive: true });
  const localPath = path.join(cacheDir, `${safe}-${suffix}-fallback.png`);
  const title = cleanRomName(fileName);
  const nesScript = [
    "Add-Type -AssemblyName System.Drawing",
    `$source=[System.Drawing.Bitmap]::FromFile(${powershellSingleQuoted(template)})`,
    "$image=[System.Drawing.Bitmap]::new($source.Width,$source.Height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
    "$g=[System.Drawing.Graphics]::FromImage($image);$g.SmoothingMode='AntiAlias';$g.TextRenderingHint='AntiAliasGridFit';$g.Clear([System.Drawing.Color]::Transparent);$g.DrawImage($source,0,0,$source.Width,$source.Height)",
    "$labelX=[int]($source.Width*0.407);$labelY=[int]($source.Height*0.02);$labelW=[int]($source.Width*0.45);$labelH=[int]($source.Height*0.66);$bandH=[int]($source.Height*0.10)",
    "$red=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(210,0,24));$dark=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(67,69,67))",
    "$g.FillRectangle($dark,$labelX,$labelY,$labelW,$labelH);$g.FillRectangle($red,$labelX,$labelY,$labelW,$bandH)",
    "$brand=[System.Drawing.Font]::new('Arial',42,[System.Drawing.FontStyle]::Bold);$titleFont=[System.Drawing.Font]::new('Arial',38,[System.Drawing.FontStyle]::Bold)",
    "$center=[System.Drawing.StringFormat]::new();$center.Alignment='Center';$center.LineAlignment='Center'",
    "$g.DrawString('Nintendo',$brand,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new($labelX,$labelY,$labelW,$bandH),$center)",
    `$g.DrawString(${powershellSingleQuoted(title)},$titleFont,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new($labelX,($labelY+$bandH),$labelW,($labelH-$bandH)),$center)`,
    `$image.Save(${powershellSingleQuoted(localPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
    "$center.Dispose();$titleFont.Dispose();$brand.Dispose();$dark.Dispose();$red.Dispose();$g.Dispose();$image.Dispose();$source.Dispose()"
  ].join(";");
  const snesScript = [
    "Add-Type -AssemblyName System.Drawing",
    `$source=[System.Drawing.Bitmap]::FromFile(${powershellSingleQuoted(template)})`,
    "$image=[System.Drawing.Bitmap]::new($source.Width,$source.Height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
    "$g=[System.Drawing.Graphics]::FromImage($image);$g.SmoothingMode='AntiAlias';$g.TextRenderingHint='AntiAliasGridFit';$g.Clear([System.Drawing.Color]::Transparent);$g.DrawImage($source,0,0,$source.Width,$source.Height)",
    "$labelX=[int]($source.Width*0.19);$labelY=[int]($source.Height*0.01);$labelW=[int]($source.Width*0.62);$labelH=[int]($source.Height*0.43);$bandH=[int]($source.Height*0.10)",
    "$dark=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(35,35,38));$blue=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(40,104,178));$g.FillRectangle($dark,$labelX,$labelY,$labelW,$labelH);$g.FillRectangle($blue,$labelX,$labelY,$labelW,$bandH)",
    "$brand=[System.Drawing.Font]::new('Arial',46,[System.Drawing.FontStyle]::Bold);$titleFont=[System.Drawing.Font]::new('Arial',42,[System.Drawing.FontStyle]::Bold)",
    "$center=[System.Drawing.StringFormat]::new();$center.Alignment='Center';$center.LineAlignment='Center'",
    "$g.DrawString('Super Nintendo',$brand,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new($labelX,$labelY,$labelW,$bandH),$center)",
    `$g.DrawString(${powershellSingleQuoted(title)},$titleFont,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new($labelX,($labelY+$bandH),$labelW,($labelH-$bandH)),$center)`,
    `$image.Save(${powershellSingleQuoted(localPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
    "$center.Dispose();$titleFont.Dispose();$brand.Dispose();$blue.Dispose();$dark.Dispose();$g.Dispose();$image.Dispose();$source.Dispose()"
  ].join(";");
  const n64Script = [
    "Add-Type -AssemblyName System.Drawing",
    `$source=[System.Drawing.Bitmap]::FromFile(${powershellSingleQuoted(template)})`,
    "$image=[System.Drawing.Bitmap]::new($source.Width,$source.Height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
    "$g=[System.Drawing.Graphics]::FromImage($image);$g.SmoothingMode='AntiAlias';$g.TextRenderingHint='AntiAliasGridFit';$g.Clear([System.Drawing.Color]::Transparent);$g.DrawImage($source,0,0,$source.Width,$source.Height)",
    "$labelX=[int]($source.Width*0.25);$labelY=[int]($source.Height*0.09);$labelW=[int]($source.Width*0.50);$labelH=[int]($source.Height*0.82);$bandH=[int]($source.Height*0.11)",
    "$dark=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(55,56,61));$purple=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(83,57,145));$g.FillRectangle($dark,$labelX,$labelY,$labelW,$labelH);$g.FillRectangle($purple,$labelX,$labelY,$labelW,$bandH)",
    "$brand=[System.Drawing.Font]::new('Arial',42,[System.Drawing.FontStyle]::Bold);$titleFont=[System.Drawing.Font]::new('Arial',38,[System.Drawing.FontStyle]::Bold);$center=[System.Drawing.StringFormat]::new();$center.Alignment='Center';$center.LineAlignment='Center'",
    "$g.DrawString('Nintendo 64',$brand,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new($labelX,$labelY,$labelW,$bandH),$center)",
    `$g.DrawString(${powershellSingleQuoted(title)},$titleFont,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new($labelX,($labelY+$bandH),$labelW,($labelH-$bandH)),$center)`,
    `$image.Save(${powershellSingleQuoted(localPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
    "$center.Dispose();$titleFont.Dispose();$brand.Dispose();$purple.Dispose();$dark.Dispose();$g.Dispose();$image.Dispose();$source.Dispose()"
  ].join(";");
  const wiiScript = [
    "Add-Type -AssemblyName System.Drawing",
    "$image=[System.Drawing.Bitmap]::new(1000,1000,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
    "$g=[System.Drawing.Graphics]::FromImage($image);$g.SmoothingMode='AntiAlias';$g.TextRenderingHint='AntiAliasGridFit';$g.Clear([System.Drawing.Color]::Transparent)",
    "$face=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(238,238,238));$g.FillEllipse($face,28,28,944,944);$blue=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(" + (system === "gamecube" ? "101,77,160" : ["ps1", "xbox", "xbox360"].includes(system) ? "42,145,82" : "52,163,214") + "));$ink=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(55,56,61));$g.FillRectangle($blue,190,105,620,105)",
    "$brand=[System.Drawing.Font]::new('Arial',48,[System.Drawing.FontStyle]::Bold);$titleFont=[System.Drawing.Font]::new('Arial',46,[System.Drawing.FontStyle]::Bold);$center=[System.Drawing.StringFormat]::new();$center.Alignment='Center';$center.LineAlignment='Center'",
    `$g.DrawString(${powershellSingleQuoted(system === "gamecube" ? "GameCube" : system === "ps1" ? "PlayStation" : system === "ps2" ? "PlayStation 2" : system === "ps3" ? "PlayStation 3" : system === "xbox" ? "Xbox" : system === "xbox360" ? "Xbox 360" : "Wii")},$brand,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new(190,105,620,105),$center)`,
    `$g.DrawString(${powershellSingleQuoted(title)},$titleFont,$ink,[System.Drawing.RectangleF]::new(165,235,670,160),$center)`,
    "$g.CompositingMode=[System.Drawing.Drawing2D.CompositingMode]::SourceCopy;$clear=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::Transparent);$g.FillEllipse($clear,405,405,190,190)",
    `$image.Save(${powershellSingleQuoted(localPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
    "$clear.Dispose();$center.Dispose();$titleFont.Dispose();$brand.Dispose();$ink.Dispose();$blue.Dispose();$face.Dispose();$g.Dispose();$image.Dispose()"
  ].join(";");
  const ps4Script = [
    "Add-Type -AssemblyName System.Drawing",
    `$source=[System.Drawing.Bitmap]::FromFile(${powershellSingleQuoted(template)})`,
    "$image=[System.Drawing.Bitmap]::new($source.Width,$source.Height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
    "$g=[System.Drawing.Graphics]::FromImage($image);$g.SmoothingMode='AntiAlias';$g.TextRenderingHint='AntiAliasGridFit';$g.Clear([System.Drawing.Color]::Transparent);$g.DrawImage($source,0,0,$source.Width,$source.Height)",
    "$left=[int]($source.Width*0.025);$top=[int]($source.Height*0.035);$width=[int]($source.Width*0.95);$header=[int]($source.Height*0.12);$bodyTop=$top+$header;$bodyHeight=[int]($source.Height*0.82)",
    "$blue=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(0,94,184));$dark=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(25,28,38));$g.FillRectangle($blue,$left,$top,$width,$header);$g.FillRectangle($dark,$left,$bodyTop,$width,$bodyHeight)",
    "$brand=[System.Drawing.Font]::new('Arial',54,[System.Drawing.FontStyle]::Bold);$titleFont=[System.Drawing.Font]::new('Arial',52,[System.Drawing.FontStyle]::Bold);$center=[System.Drawing.StringFormat]::new();$center.Alignment='Center';$center.LineAlignment='Center'",
    `$g.DrawString(${powershellSingleQuoted(system === "wiiu" ? "Wii U" : "PlayStation 4")},$brand,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new($left,$top,$width,$header),$center)`,
    `$g.DrawString(${powershellSingleQuoted(title)},$titleFont,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new($left,($bodyTop+30),$width,($bodyHeight-60)),$center)`,
    `$image.Save(${powershellSingleQuoted(localPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
    "$center.Dispose();$titleFont.Dispose();$brand.Dispose();$dark.Dispose();$blue.Dispose();$g.Dispose();$image.Dispose();$source.Dispose()"
  ].join(";");
  const gbaScript = [
    "Add-Type -AssemblyName System.Drawing",
    `$source=[System.Drawing.Bitmap]::FromFile(${powershellSingleQuoted(template)})`,
    "$image=[System.Drawing.Bitmap]::new($source.Width,$source.Height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
    "$g=[System.Drawing.Graphics]::FromImage($image);$g.SmoothingMode='AntiAlias';$g.TextRenderingHint='AntiAliasGridFit';$g.Clear([System.Drawing.Color]::Transparent);$g.DrawImage($source,0,0,$source.Width,$source.Height)",
    "$labelX=[int]($source.Width*0.13);$labelY=[int]($source.Height*0.23);$labelW=[int]($source.Width*0.74);$labelH=[int]($source.Height*0.64);$bandH=[int]($source.Height*0.16)",
    "$dark=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(42,42,48));$purple=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(106,62,166));$g.FillRectangle($dark,$labelX,$labelY,$labelW,$labelH);$g.FillRectangle($purple,$labelX,$labelY,$labelW,$bandH)",
    "$brand=[System.Drawing.Font]::new('Arial',38,[System.Drawing.FontStyle]::Bold);$titleFont=[System.Drawing.Font]::new('Arial',42,[System.Drawing.FontStyle]::Bold);$center=[System.Drawing.StringFormat]::new();$center.Alignment='Center';$center.LineAlignment='Center'",
    "$g.DrawString('Game Boy Advance',$brand,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new($labelX,$labelY,$labelW,$bandH),$center)",
    `$g.DrawString(${powershellSingleQuoted(title)},$titleFont,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new($labelX,($labelY+$bandH),$labelW,($labelH-$bandH)),$center)`,
    `$image.Save(${powershellSingleQuoted(localPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
    "$center.Dispose();$titleFont.Dispose();$brand.Dispose();$purple.Dispose();$dark.Dispose();$g.Dispose();$image.Dispose();$source.Dispose()"
  ].join(";");
  const mameScript = [
    "Add-Type -AssemblyName System.Drawing",
    `$source=[System.Drawing.Bitmap]::FromFile(${powershellSingleQuoted(template)})`,
    "$image=[System.Drawing.Bitmap]::new($source.Width,$source.Height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
    "$g=[System.Drawing.Graphics]::FromImage($image);$g.SmoothingMode='AntiAlias';$g.TextRenderingHint='AntiAliasGridFit';$g.Clear([System.Drawing.Color]::Transparent);$g.DrawImage($source,0,0,$source.Width,$source.Height)",
    "$front=[System.Drawing.Point[]]@([System.Drawing.Point]::new(106,50),[System.Drawing.Point]::new(581,101),[System.Drawing.Point]::new(581,833),[System.Drawing.Point]::new(106,798));$spine=[System.Drawing.Point[]]@([System.Drawing.Point]::new(0,39),[System.Drawing.Point]::new(106,50),[System.Drawing.Point]::new(106,798),[System.Drawing.Point]::new(0,861))",
    "$dark=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(28,30,38));$blue=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(34,109,190));$g.FillPolygon($dark,$front);$g.FillPolygon($dark,$spine);$g.FillPolygon($blue,[System.Drawing.Point[]]@([System.Drawing.Point]::new(106,50),[System.Drawing.Point]::new(581,101),[System.Drawing.Point]::new(581,220),[System.Drawing.Point]::new(106,180)))",
    "$brand=[System.Drawing.Font]::new('Arial',38,[System.Drawing.FontStyle]::Bold);$titleFont=[System.Drawing.Font]::new('Arial',42,[System.Drawing.FontStyle]::Bold);$center=[System.Drawing.StringFormat]::new();$center.Alignment='Center';$center.LineAlignment='Center'",
    "$state=$g.Save();$g.TranslateTransform(340,350);$g.RotateTransform(6.1);$g.TranslateTransform(-340,-350)",
    "$g.DrawString('ARCADE',$brand,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new(145,72,390,95),$center)",
    `$g.DrawString(${powershellSingleQuoted(title)},$titleFont,[System.Drawing.Brushes]::White,[System.Drawing.RectangleF]::new(145,210,385,430),$center);$g.Restore($state)`,
    `$image.Save(${powershellSingleQuoted(localPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
    "$center.Dispose();$titleFont.Dispose();$brand.Dispose();$blue.Dispose();$dark.Dispose();$g.Dispose();$image.Dispose();$source.Dispose()"
  ].join(";");
  const script = system === "snes" ? snesScript : system === "n64" ? n64Script : system === "gba" ? gbaScript : ["ps4", "wiiu"].includes(system) ? ps4Script : system === "mame" ? mameScript : ["gamecube", "wii", "ps1", "ps2", "ps3", "xbox", "xbox360"].includes(system) ? wiiScript : nesScript;
  await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 30000 }, error => error ? reject(error) : resolve()));
  return { localPath, fileName: path.basename(localPath) };
}

async function cacheGenericConsoleFallbackArtwork(system, fileName) {
  const safe = cleanRomName(fileName).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "game";
  const suffix = crypto.createHash("sha1").update(fileName).digest("hex").slice(0, 8);
  const cacheDir = path.join(root, "scraper-cache", system);
  fs.mkdirSync(cacheDir, { recursive: true });
  const localPath = path.join(cacheDir, `${safe}-${suffix}-fallback.png`);
  const title = cleanRomName(fileName);
  const systemTitle = systemLabels[system] || system.toUpperCase();
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    "$image=[System.Drawing.Bitmap]::new(900,600,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
    "$g=[System.Drawing.Graphics]::FromImage($image);$g.SmoothingMode='AntiAlias';$g.TextRenderingHint='AntiAliasGridFit';$g.Clear([System.Drawing.Color]::Transparent)",
    "$body=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,42,45,52));$accent=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,48,118,196));$white=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)",
    "$g.FillRectangle($body,20,20,860,560);$g.FillRectangle($accent,20,20,860,105)",
    "$brand=[System.Drawing.Font]::new('Arial',40,[System.Drawing.FontStyle]::Bold);$titleFont=[System.Drawing.Font]::new('Arial',48,[System.Drawing.FontStyle]::Bold);$center=[System.Drawing.StringFormat]::new();$center.Alignment='Center';$center.LineAlignment='Center'",
    `$g.DrawString(${powershellSingleQuoted(systemTitle)},$brand,$white,[System.Drawing.RectangleF]::new(40,20,820,105),$center)`,
    `$g.DrawString(${powershellSingleQuoted(title)},$titleFont,$white,[System.Drawing.RectangleF]::new(60,150,780,390),$center)`,
    `$image.Save(${powershellSingleQuoted(localPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
    "$center.Dispose();$titleFont.Dispose();$brand.Dispose();$white.Dispose();$accent.Dispose();$body.Dispose();$g.Dispose();$image.Dispose()"
  ].join(";");
  await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 30000 }, error => error ? reject(error) : resolve()));
  return { localPath, fileName: path.basename(localPath) };
}

async function cacheLocalConsoleArtwork(sourcePath, system, fileName) {
  const safe = cleanRomName(fileName).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "game";
  const suffix = crypto.createHash("sha1").update(fileName).digest("hex").slice(0, 8);
  const cacheDir = path.join(root, "scraper-cache", system);
  fs.mkdirSync(cacheDir, { recursive: true });
  const localPath = path.join(cacheDir, `${safe}-${suffix}.png`);
  const standardScript = [
    "Add-Type -AssemblyName System.Drawing",
    `$source=[System.Drawing.Image]::FromFile(${powershellSingleQuoted(sourcePath)})`,
    "$canvas=[System.Drawing.Bitmap]::new($source.Width,$source.Height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
    "$graphics=[System.Drawing.Graphics]::FromImage($canvas)",
    "$graphics.Clear([System.Drawing.Color]::Transparent)",
    "$graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic",
    "$graphics.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality",
    "$width=[Math]::Max(1,[int]($source.Width*0.88))",
    "$height=[Math]::Max(1,[int]($source.Height*0.88))",
    "$left=[int](($source.Width-$width)/2)",
    "$top=[int](($source.Height-$height)/2)",
    "$graphics.DrawImage($source,$left,$top,$width,$height)",
    `$canvas.Save(${powershellSingleQuoted(localPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
    "$graphics.Dispose();$canvas.Dispose();$source.Dispose()"
  ].join(";");
  const nesCartridgeScript = [
    "Add-Type -AssemblyName System.Drawing",
    `$source=[System.Drawing.Image]::FromFile(${powershellSingleQuoted(sourcePath)})`,
    "$canvas=[System.Drawing.Bitmap]::new(1240,1380,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
    "$graphics=[System.Drawing.Graphics]::FromImage($canvas)",
    "$graphics.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias",
    "$graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic",
    "$graphics.Clear([System.Drawing.Color]::Transparent)",
    "$body=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,158,160,155))",
    "$dark=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,67,69,67))",
    "$shell=[System.Drawing.Drawing2D.GraphicsPath]::new()",
    "$outline=[System.Drawing.Point[]]@([System.Drawing.Point]::new(44,30),[System.Drawing.Point]::new(1196,30),[System.Drawing.Point]::new(1210,44),[System.Drawing.Point]::new(1210,1230),[System.Drawing.Point]::new(1182,1230),[System.Drawing.Point]::new(1182,1340),[System.Drawing.Point]::new(58,1340),[System.Drawing.Point]::new(58,1230),[System.Drawing.Point]::new(30,1230),[System.Drawing.Point]::new(30,44))",
    "$shell.AddPolygon($outline)",
    "$graphics.FillPath($body,$shell)",
    "$edge=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255,99,101,98),5);$graphics.DrawPath($edge,$shell)",
    "$shine=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255,184,186,181),5)",
    "$graphics.DrawLine($shine,48,40,1193,40);$graphics.DrawLine($shine,40,48,40,1220)",
    "$labelHeight=870;$labelWidth=[int]([Math]::Min(710,$labelHeight*$source.Width/$source.Height));$labelHeight=[int]($labelWidth*$source.Height/$source.Width)",
    "$labelX=[int](790-$labelWidth/2);$labelY=62",
    "$graphics.FillRectangle($dark,$labelX-10,$labelY-10,$labelWidth+20,$labelHeight+20)",
    "$graphics.DrawImage($source,$labelX,$labelY,$labelWidth,$labelHeight)",
    "$groove=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255,120,122,118),8)",
    "$graphics.DrawLine($groove,395,38,395,990);$graphics.DrawLine($shine,406,38,406,990)",
    "for($y=90;$y -le 940;$y+=32){$graphics.DrawLine($groove,66,$y,365,$y);$graphics.DrawLine($shine,66,($y+7),365,($y+7))}",
    "$graphics.DrawLine($groove,60,990,1180,990);$graphics.DrawLine($shine,60,1000,1180,1000)",
    "$graphics.DrawLine($edge,62,1296,1178,1296);$graphics.DrawLine($shine,62,1303,1178,1303)",
    "$arrow=[System.Drawing.Point[]]@([System.Drawing.Point]::new(740,1140),[System.Drawing.Point]::new(840,1140),[System.Drawing.Point]::new(790,1190))",
    "$graphics.FillPolygon($dark,$arrow)",
    `$canvas.Save(${powershellSingleQuoted(localPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
    "$edge.Dispose();$shine.Dispose();$shell.Dispose();$groove.Dispose();$dark.Dispose();$body.Dispose();$graphics.Dispose();$canvas.Dispose();$source.Dispose()"
  ].join(";");
  const snesCartridgeScript = [
    "Add-Type -AssemblyName System.Drawing",
    `$source=[System.Drawing.Image]::FromFile(${powershellSingleQuoted(sourcePath)})`,
    "$canvas=[System.Drawing.Bitmap]::new(1400,900,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
    "$graphics=[System.Drawing.Graphics]::FromImage($canvas)",
    "$graphics.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias",
    "$graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic",
    "$graphics.Clear([System.Drawing.Color]::Transparent)",
    "$body=[System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.Point]::new(0,35),[System.Drawing.Point]::new(0,970),[System.Drawing.Color]::FromArgb(255,190,190,186),[System.Drawing.Color]::FromArgb(255,145,146,143))",
    "$dark=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,67,68,69))",
    "$shell=[System.Drawing.Drawing2D.GraphicsPath]::new()",
    "$shell.StartFigure();$shell.AddLine(250,55,1150,55);$shell.AddBezier(1150,55,1170,55,1170,82,1170,105);$shell.AddLine(1170,105,1325,105);$shell.AddBezier(1325,105,1355,105,1355,135,1355,165);$shell.AddLine(1355,165,1355,820);$shell.AddBezier(1355,820,1355,842,1333,850,1310,850);$shell.AddLine(1310,850,90,850);$shell.AddBezier(90,850,45,850,45,820,45,790);$shell.AddLine(45,790,45,165);$shell.AddBezier(45,165,45,135,75,105,105,105);$shell.AddLine(105,105,230,105);$shell.AddLine(230,105,230,82);$shell.AddBezier(230,82,230,55,250,55,250,55);$shell.CloseFigure()",
    "$graphics.FillPath($body,$shell)",
    "$edge=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255,82,83,81),8);$edge.LineJoin=[System.Drawing.Drawing2D.LineJoin]::Round;$graphics.DrawPath($edge,$shell)",
    "$shine=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255,194,195,191),6);$shine.LineJoin=[System.Drawing.Drawing2D.LineJoin]::Round",
    "$shadow=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255,108,109,106),10)",
    "$graphics.DrawLine($shine,255,67,1145,67);$graphics.DrawLine($shine,62,170,62,805);$graphics.DrawLine($shadow,1338,170,1338,805)",
    "$graphics.DrawLine($shadow,230,105,230,815);$graphics.DrawLine($shine,244,105,244,815);$graphics.DrawLine($shadow,1170,105,1170,815);$graphics.DrawLine($shine,1156,105,1156,815)",
    "$labelX=285;$labelY=92;$labelWidth=830;$labelHeight=285",
    "$graphics.FillRectangle($dark,$labelX-18,$labelY-18,$labelWidth+36,$labelHeight+36)",
    "$labelEdge=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255,94,95,93),12);$graphics.DrawRectangle($labelEdge,$labelX-25,$labelY-25,$labelWidth+50,$labelHeight+50)",
    "$scale=[Math]::Min($labelWidth/$source.Width,$labelHeight/$source.Height)",
    "$drawWidth=[int]($source.Width*$scale);$drawHeight=[int]($source.Height*$scale)",
    "$drawX=[int]($labelX+($labelWidth-$drawWidth)/2);$drawY=[int]($labelY+($labelHeight-$drawHeight)/2)",
    "$graphics.DrawImage($source,$drawX,$drawY,$drawWidth,$drawHeight)",
    "$groove=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255,107,108,105),9)",
    "foreach($y in @(240,365,490,615)){ $graphics.DrawLine($groove,52,$y,230,$y);$graphics.DrawLine($shine,52,($y+10),230,($y+10));$graphics.DrawLine($groove,1170,$y,1348,$y);$graphics.DrawLine($shine,1170,($y+10),1348,($y+10)) }",
    "$lower=[System.Drawing.Drawing2D.GraphicsPath]::new();$lower.AddArc(295,445,45,45,180,90);$lower.AddLine(317,445,1083,445);$lower.AddArc(1060,445,45,45,270,90);$lower.AddLine(1105,467,1105,735);$lower.AddLine(1105,735,1080,775);$lower.AddLine(1080,775,320,775);$lower.AddLine(320,775,295,735);$lower.CloseFigure();$graphics.DrawPath($shadow,$lower);$graphics.DrawPath($shine,$lower)",
    "$graphics.DrawArc($groove,125,735,54,54,0,360);$graphics.DrawArc($groove,1221,735,54,54,0,360)",
    "$lower.Dispose()",
    `$canvas.Save(${powershellSingleQuoted(localPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
    "$labelEdge.Dispose();$shadow.Dispose();$groove.Dispose();$edge.Dispose();$shine.Dispose();$shell.Dispose();$dark.Dispose();$body.Dispose();$graphics.Dispose();$canvas.Dispose();$source.Dispose()"
  ].join(";");
  const script = system === "nes" ? nesCartridgeScript : system === "snes" ? snesCartridgeScript : standardScript;
  await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 30000 },
    (error, _stdout, stderr) => error ? reject(new Error(String(stderr || error.message).trim())) : resolve()));
  return { localPath, fileName: path.basename(localPath) };
}

async function cacheNesPictureArtwork(sourcePath, fileName, system = "nes") {
  const safe = cleanRomName(fileName).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "game";
  const suffix = crypto.createHash("sha1").update(fileName).digest("hex").slice(0, 8);
  const cacheDir = path.join(root, "scraper-cache", system);
  fs.mkdirSync(cacheDir, { recursive: true });
  const sourceExtension = path.extname(sourcePath).toLowerCase();
  const discSystem = ["gamecube", "wii", "ps1", "ps2", "ps3", "xbox", "xbox360"].includes(system);
  const extension = discSystem ? ".png" : ([".jpg", ".jpeg", ".png", ".webp"].includes(sourceExtension) ? sourceExtension : ".png");
  const localPath = path.join(cacheDir, `${safe}-${suffix}-picture${extension}`);
  // A matched local-media game uses the covers/<system> asset and never a
  // provider/legacy substitute. Non-disc art is copied byte-for-byte.
  if (!discSystem) {
    fs.copyFileSync(sourcePath, localPath);
  } else {
    // Some disc-art packs contain opaque corner blocks or other residue beyond
    // the printed disc. Batocera must receive only the circular disc, with a
    // genuinely transparent exterior, regardless of defects in the source PNG.
    const script = [
      "Add-Type -AssemblyName System.Drawing",
      `$source=[System.Drawing.Bitmap]::FromFile(${powershellSingleQuoted(sourcePath)})`,
      "$side=[Math]::Min($source.Width,$source.Height)",
      "$left=[int](($source.Width-$side)/2);$top=[int](($source.Height-$side)/2)",
      "$target=[System.Drawing.Bitmap]::new($side,$side,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
      "$graphics=[System.Drawing.Graphics]::FromImage($target);$graphics.SmoothingMode='AntiAlias';$graphics.InterpolationMode='HighQualityBicubic';$graphics.PixelOffsetMode='HighQuality';$graphics.Clear([System.Drawing.Color]::Transparent)",
      "$disc=[System.Drawing.Drawing2D.GraphicsPath]::new();$disc.AddEllipse(1,1,$side-2,$side-2);$graphics.SetClip($disc)",
      "$destination=[System.Drawing.Rectangle]::new(0,0,$side,$side);$sourceRect=[System.Drawing.Rectangle]::new($left,$top,$side,$side)",
      "$graphics.DrawImage($source,$destination,$sourceRect,[System.Drawing.GraphicsUnit]::Pixel)",
      "$graphics.ResetClip()",
      `$target.Save(${powershellSingleQuoted(localPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
      "$disc.Dispose();$graphics.Dispose();$target.Dispose();$source.Dispose()"
    ].join(";");
    await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 30000 },
      (error, _stdout, stderr) => error ? reject(new Error(String(stderr || error.message).trim())) : resolve()));
  }
  return { localPath, fileName: path.basename(localPath) };
}

async function cacheSnesPictureArtwork(sourcePath, fileName) {
  const safe = cleanRomName(fileName).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "game";
  const suffix = crypto.createHash("sha1").update(fileName).digest("hex").slice(0, 8);
  const cacheDir = path.join(root, "scraper-cache", "snes");
  fs.mkdirSync(cacheDir, { recursive: true });
  const sourceExtension = path.extname(sourcePath).toLowerCase();
  const extension = [".jpg", ".jpeg", ".png", ".webp"].includes(sourceExtension) ? sourceExtension : ".png";
  const localPath = path.join(cacheDir, `${safe}-${suffix}-picture${extension}`);
  // A matched SNES game uses the complete local covers/snes cartridge asset
  // verbatim. Never crop the label or substitute provider/legacy artwork.
  fs.copyFileSync(sourcePath, localPath);
  return { localPath, fileName: path.basename(localPath) };
}

async function cacheCartridgePlaceholder(system, fileName) {
  if (!["nes", "snes"].includes(system)) return null;
  const cacheDir = path.join(root, "scraper-cache", system);
  fs.mkdirSync(cacheDir, { recursive: true });
  const labelPath = path.join(cacheDir, `.rp1-label-${crypto.randomUUID()}.png`);
  const title = cleanRomName(fileName);
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    "$label=[System.Drawing.Bitmap]::new(900,600,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
    "$graphics=[System.Drawing.Graphics]::FromImage($label)",
    "$graphics.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias",
    "$graphics.Clear([System.Drawing.Color]::FromArgb(255,35,35,38))",
    "$accent=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255,210,35,45))",
    "$white=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)",
    "$brand=[System.Drawing.Font]::new('Arial',42,[System.Drawing.FontStyle]::Bold)",
    "$titleFont=[System.Drawing.Font]::new('Arial',56,[System.Drawing.FontStyle]::Bold)",
    "$graphics.FillRectangle($accent,0,0,900,92)",
    `$graphics.DrawString(${powershellSingleQuoted(system === "snes" ? "SUPER NINTENDO" : "NINTENDO ENTERTAINMENT SYSTEM")},$brand,$white,28,18)`,
    "$format=[System.Drawing.StringFormat]::new();$format.Alignment=[System.Drawing.StringAlignment]::Center;$format.LineAlignment=[System.Drawing.StringAlignment]::Center",
    `$graphics.DrawString(${powershellSingleQuoted(title)},$titleFont,$white,[System.Drawing.RectangleF]::new(45,115,810,430),$format)`,
    `$label.Save(${powershellSingleQuoted(labelPath)},[System.Drawing.Imaging.ImageFormat]::Png)`,
    "$format.Dispose();$titleFont.Dispose();$brand.Dispose();$white.Dispose();$accent.Dispose();$graphics.Dispose();$label.Dispose()"
  ].join(";");
  try {
    await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 30000 },
      (error, _stdout, stderr) => error ? reject(new Error(String(stderr || error.message).trim())) : resolve()));
    return await cacheLocalConsoleArtwork(labelPath, system, fileName);
  } finally {
    fs.rmSync(labelPath, { force: true });
  }
}

const coverProjectSystems = {
  nes: { directory: "nes", prefix: "nes" },
  snes: { directory: "super_nintendo", prefix: "snes" },
  sega: { directory: "sega_genesis", prefix: "genesis" },
  gba: { directory: "gameboy_advance", prefix: "gba" },
  ps1: { directory: "playstation_1", prefix: "psx" },
  ps2: { directory: "playstation_2", prefix: "ps2" },
  ps3: { directory: "playstation_3", prefix: "ps3" },
  n64: { directory: "nintendo_64", prefix: "n64" }
};

async function cropCoverProjectFront(sourcePath, destinationPath, system) {
  if (!["nes", "snes"].includes(system)) {
    fs.renameSync(sourcePath, destinationPath);
    return;
  }
  const imageFormat = path.extname(destinationPath).toLowerCase() === ".png" ? "Png" : "Jpeg";
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    `$source=[System.Drawing.Bitmap]::FromFile(${powershellSingleQuoted(sourcePath)})`,
    "$panelWidth=[Math]::Min($source.Width,[int][Math]::Round($source.Height*0.722))",
    "$left=$source.Width-$panelWidth",
    "$rectangle=[System.Drawing.Rectangle]::new($left,0,$panelWidth,$source.Height)",
    "$front=$source.Clone($rectangle,$source.PixelFormat)",
    `$front.Save(${powershellSingleQuoted(destinationPath)},[System.Drawing.Imaging.ImageFormat]::${imageFormat})`,
    "$front.Dispose();$source.Dispose()"
  ].join(";");
  try {
    await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 30000 },
      (error, _stdout, stderr) => error ? reject(new Error(String(stderr || error.message).trim())) : resolve()));
  } finally {
    fs.rmSync(sourcePath, { force: true });
  }
}

async function scrapeCoverProject(system, fileName) {
  const platform = coverProjectSystems[system];
  if (!platform) return null;
  const gameKey = localCoverKey(cleanRomName(fileName));
  if (!gameKey) return null;
  const baseName = `${platform.prefix}_${gameKey}`;
  let response = null;
  let extension = "";
  for (const candidate of [".jpg", ".png"]) {
    const url = `https://coverproject.sfo2.cdn.digitaloceanspaces.com/${platform.directory}/${baseName}${candidate}`;
    try {
      response = await fetchWithLimit(url, {}, 30000);
      extension = candidate;
      break;
    } catch { /* Try the other image format before declaring no match. */ }
  }
  if (!response) return null;
  const coversRoot = path.join(root, "covers");
  fs.mkdirSync(coversRoot, { recursive: true });
  const systemKeys = [system, systemFolders[system], systemLabels[system]].map(localCoverKey).filter(Boolean);
  const existingDir = fs.readdirSync(coversRoot, { withFileTypes: true })
    .find(entry => entry.isDirectory() && systemKeys.includes(localCoverKey(entry.name)));
  const systemDir = path.join(coversRoot, existingDir?.name || system);
  fs.mkdirSync(systemDir, { recursive: true });
  const localImagePath = path.join(systemDir, `${baseName}${extension}`);
  const downloadedPath = `${localImagePath}.full${extension}`;
  fs.writeFileSync(downloadedPath, Buffer.from(await response.arrayBuffer()));
  await cropCoverProjectFront(downloadedPath, localImagePath, system);
  return { name: cleanRomName(fileName), desc: "", releasedate: "", rating: "", players: "", localImagePath, provider: "The Cover Project" };
}

async function scrapeConsoleGame(settings, system, fileName) {
  // Xbox and Xbox 360 follow the same strict two-outcome rule as MAME:
  // matched original from the local covers folder, or RP1's generated default.
  // No provider/web lookup is permitted for any system in this set.
  if (usesLocalOnlyArtwork(system)) {
    const localImagePath = await findLocalConsoleCover(system, fileName);
    return localImagePath ? { name: displayGameTitle(system, fileName), desc: "", releasedate: "", rating: "", players: "", localImagePath, provider: `Local covers/${system} only` } : null;
  }
  if (settings.provider === "This PC") {
    const localImagePath = await findLocalConsoleCover(system, fileName);
    return localImagePath ? { name: cleanRomName(fileName), desc: "", releasedate: "", rating: "", players: "", localImagePath, provider: "This PC" } : null;
  }
  if (settings.provider === "The Cover Project") return scrapeCoverProject(system, fileName);
  if (settings.provider === "TheGamesDB") return scrapeTheGamesDb(settings, system, fileName);
  if (settings.provider === "ScreenScraper") return scrapeScreenScraper(settings, system, fileName);
  if (settings.provider === "IGDB") return scrapeIgdb(settings, system, fileName);
  if (settings.provider === "ArcadeDB") return scrapeArcadeDb(system, fileName);
  throw new Error("Save a supported scraper provider first.");
}

function consoleGameXml(fileName, metadata, remoteImage, remoteThumbnail = "", remoteMarquee = "") {
  const fields = [
    `    <path>./${xmlText(fileName.replace(/\\/g, "/"))}</path>`,
    `    <name>${xmlText(metadata.name)}</name>`,
    metadata.desc && `    <desc>${xmlText(metadata.desc)}</desc>`,
    remoteImage && `    <image>${xmlText(remoteImage)}</image>`,
    remoteThumbnail && `    <thumbnail>${xmlText(remoteThumbnail)}</thumbnail>`,
    remoteMarquee && `    <marquee>${xmlText(remoteMarquee)}</marquee>`,
    metadata.releasedate && `    <releasedate>${xmlText(metadata.releasedate)}T000000</releasedate>`,
    metadata.rating && `    <rating>${xmlText(metadata.rating)}</rating>`,
    metadata.players && `    <players>${xmlText(metadata.players)}</players>`,
    `    <scraper>${xmlText(metadata.provider || "Ready Player One")}</scraper>`
  ].filter(Boolean).join("\n");
  return `  <game>\n${fields}\n  </game>`;
}

function consoleArtworkRomPath(system, fileName) {
  if (system !== "xbox360") return fileName;
  try {
    const gameRoot = safeLocalRomPath(system, fileName);
    if (!fs.statSync(gameRoot).isDirectory()) return fileName;
    const launchers = listLocalFilesRecursive(gameRoot, new Set([".xbox360"]));
    if (launchers.length !== 1) return fileName;
    return path.posix.join(fileName.replace(/\\/g, "/"), launchers[0]);
  } catch {
    return fileName;
  }
}

async function downloadConsoleArtwork(url, system, fileName) {
  if (!url) return null;
  if (["nes", "snes"].includes(system)) throw new Error(`${system.toUpperCase()} artwork is restricted to the local covers folder.`);
  const response = await fetchWithLimit(url, {}, 25000);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const ext = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg";
  const safe = cleanRomName(fileName).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "game";
  const suffix = crypto.createHash("sha1").update(fileName).digest("hex").slice(0, 8);
  const cacheDir = path.join(root, "scraper-cache", system);
  fs.mkdirSync(cacheDir, { recursive: true });
  const localPath = path.join(cacheDir, `${safe}-${suffix}${ext}`);
  fs.writeFileSync(localPath, Buffer.from(await response.arrayBuffer()));
  return { localPath, fileName: path.basename(localPath) };
}

function cacheLocalConsoleBackground(sourcePath, system, fileName) {
  const safe = cleanRomName(fileName).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "game";
  const suffix = crypto.createHash("sha1").update(fileName).digest("hex").slice(0, 8);
  const extension = [".jpg", ".jpeg", ".png", ".webp"].includes(path.extname(sourcePath).toLowerCase()) ? path.extname(sourcePath).toLowerCase() : ".png";
  const cacheDir = path.join(root, "scraper-cache", system);
  fs.mkdirSync(cacheDir, { recursive: true });
  const localPath = path.join(cacheDir, `${safe}-${suffix}-background${extension}`);
  fs.copyFileSync(sourcePath, localPath);
  return { localPath, fileName: path.basename(localPath) };
}

const artworkPublishLocks = new Map();
// Installing the console presentation is intentionally more expensive than
// publishing one game's XML and image.  Do it before the first artwork publish
// for each machine/system in this process, then remember the verified result.
// This repairs machines that still have an older cartridge/box layout without
// adding the same SSH/theme work to every ROM in a batch.
const verifiedArtworkPresentations = new Set();

async function ensureArtworkPresentation(device, system) {
  if (!["nes", "snes", "gba", "n64", "gamecube", "wii", "wiiu", "ps1", "ps2", "ps3", "ps4", "xbox", "xbox360", "mame"].includes(system)) return;
  const key = `${device.host || device.name || "machine"}\u0000${system}`;
  if (verifiedArtworkPresentations.has(key)) return;
  await installNintendoPicturePresentation(device, [system]);
  verifiedArtworkPresentations.add(key);
}

async function execUploadedArtworkScript(device, script) {
  const digest = crypto.createHash('sha1').update(script).digest('hex').slice(0, 16);
  const remoteScript = `/userdata/system/.rp1-artwork-${digest}.py`;
  return sftpWithDevice(device, async (sftp, client) => {
    await writeSftpFile(sftp, remoteScript, script);
    try {
      return await execOnSshClient(client, `python ${shellSingleQuoted(remoteScript)}`);
    } finally {
      await execOnSshClient(client, `rm -f ${shellSingleQuoted(remoteScript)}`).catch(() => {});
    }
  });
}

async function publishConsoleSystem(device, system, entries, artwork, ensurePresentation = true) {
  const lockKey = `${device.host || device.name || "machine"}\u0000${system}`;
  const previous = artworkPublishLocks.get(lockKey) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  artworkPublishLocks.set(lockKey, current);
  await previous.catch(() => {});
  try {
    return await publishConsoleSystemUnlocked(device, system, entries, artwork, ensurePresentation);
  } finally {
    release();
    if (artworkPublishLocks.get(lockKey) === current) artworkPublishLocks.delete(lockKey);
  }
}

async function publishConsoleSystemUnlocked(device, system, entries, artwork, ensurePresentation = true) {
  const remoteRoot = `/userdata/roms/${systemFolders[system]}`;
  const mediaDir = `${remoteRoot}/media/images`;
  await sftpWithDevice(device, async sftp => {
    await mkdirpSftp(sftp, mediaDir);
    for (const item of artwork) await fastPutSftp(sftp, item.localPath, `${mediaDir}/${item.fileName}`);
  });
  if (!entries.length) return;
  const xml = `<?xml version="1.0"?>\n<gameList>\n${entries.join("\n")}\n</gameList>\n`;
  const encoded = Buffer.from(xml, "utf8").toString("base64");
  const publish = `import base64,json,os,re,mimetypes,urllib.request,xml.etree.ElementTree as ET
base="http://127.0.0.1:1234"
root=${JSON.stringify(remoteRoot)}
system=${JSON.stringify(systemFolders[system])}
entries=ET.fromstring(base64.b64decode(${JSON.stringify(encoded)}))
def request(route,data=None,kind="application/json"):
 req=urllib.request.Request(base+route,data=data,headers={"Content-Type":kind})
 with urllib.request.urlopen(req,timeout=20) as response: return response.read()
def games(): return {g["path"]:g for g in json.loads(request("/systems/"+system+"/games"))}
try: known=games()
except Exception: known={}
gamelist_path=os.path.join(root,"gamelist.xml")
if os.path.exists(gamelist_path):
 try:
  tree=ET.parse(gamelist_path); gamelist=tree.getroot()
 except ET.ParseError:
  # Salvage complete game records from a file damaged by an interrupted or
  # legacy append, then replace it atomically with one valid gameList root.
  raw=open(gamelist_path,encoding="utf-8",errors="ignore").read()
  gamelist=ET.Element("gameList"); tree=ET.ElementTree(gamelist); recovered=set()
  for fragment in re.findall(r"<game(?:\\s[^>]*)?>.*?</game>",raw,re.S):
   try:
    candidate=ET.fromstring(fragment); relative=candidate.findtext("path")
    if relative and relative not in recovered: gamelist.append(candidate); recovered.add(relative)
   except ET.ParseError: pass
else:
 gamelist=ET.Element("gameList"); tree=ET.ElementTree(gamelist)
# PS4 installs need a payload directory plus one .ps4 launcher. Older RP1
# metadata could retain the payload directory as a second visible game. The
# launcher is the only frontend entry; keep the required payload on disk but
# remove every non-launcher PS4 record from Batocera's durable game list.
if system=="ps4":
 for game in list(gamelist.findall("game")):
  relative=(game.findtext("path") or "").strip().lower()
  if not relative.endswith(".ps4"): gamelist.remove(game)
# Xbox 360 XBLA folders contain the real .xbox360 launcher below the outer
# transfer directory. Remove RP1's older folder-level metadata when the same
# entry is now being published against its actual launcher.
if system=="xbox360":
 launcher_roots={(e.findtext("path") or "").replace("\\\\","/").split("/",2)[1] for e in entries if (e.findtext("path") or "").lower().endswith(".xbox360") and "/" in (e.findtext("path") or "")}
 for game in list(gamelist.findall("game")):
  relative=(game.findtext("path") or "").replace("\\\\","/").rstrip("/")
  if relative.startswith("./") and "/" not in relative[2:] and relative[2:] in launcher_roots: gamelist.remove(game)
by_relative={g.findtext("path"):g for g in gamelist.findall("game")}
for entry in entries:
 relative=entry.findtext("path")
 target=by_relative.get(relative)
 if target is None:
  target=ET.SubElement(gamelist,"game"); ET.SubElement(target,"path").text=relative; by_relative[relative]=target
 for field in entry:
  if field.tag=="path": continue
  node=target.find(field.tag)
  if node is None: node=ET.SubElement(target,field.tag)
  node.text=field.text or ""
# Xbox 360 has no M3U launch entry for these ISO sets. Keep every disc on
# disk, but show only Disc 1 in EmulationStation. Reconcile the full folder on
# every artwork publish so interrupted/resumed uploads end in the same state.
if system=="xbox360":
 disc_pattern=re.compile(r"^(.*?)\\s*[\\[(]disc\\s*0*([1-9]\\d*)[\\])]\\s*(\\.[^.]+)$",re.I)
 groups={}
 for filename in os.listdir(root):
  match=disc_pattern.match(filename)
  if match and os.path.isfile(os.path.join(root,filename)):
   groups.setdefault((match.group(1).casefold(),match.group(3).casefold()),[]).append((int(match.group(2)),filename))
 for discs in groups.values():
  if len({number for number,_ in discs})<2: continue
  discs.sort(key=lambda item:(item[0],item[1].casefold()))
  for index,(_,filename) in enumerate(discs):
   relative="./"+filename
   game=by_relative.get(relative)
   if game is None:
    game=ET.SubElement(gamelist,"game"); ET.SubElement(game,"path").text=relative; by_relative[relative]=game
   hidden=game.find("hidden")
   if hidden is None: hidden=ET.SubElement(game,"hidden")
   hidden.text="false" if index==0 else "true"
try: ET.indent(tree,space="\t")
except AttributeError: pass
temporary=gamelist_path+".rp1-new"
tree.write(temporary,encoding="utf-8",xml_declaration=True)
os.replace(temporary,gamelist_path)
# The ROM and its local artwork are already durable now. Update Batocera's
# live registry when available, but never withhold the gamelist link while
# EmulationStation is still waiting for its next refresh.
for entry in entries:
 try:
  p=os.path.normpath(os.path.join(root,entry.findtext("path")))
  # addgames also refreshes metadata for a ROM already present in the live
  # registry. Batocera's per-game route is not available on every release.
  wrapper=ET.Element("gameList"); wrapper.append(entry)
  request("/addgames/"+system,ET.tostring(wrapper),"application/xml")
  known=games()
 except Exception: pass
`;
  // Large batches can exceed Batocera/dropbear's exec-command limit. Upload the
  // Python payload and execute only its short path so ROM + artwork batches do
  // not fail with "Unable to exec".
  await execUploadedArtworkScript(device, publish);
  // Verify the durable files that Soft Reset consumes. The live Batocera API
  // may not know a newly copied ROM yet, so it cannot be the publication gate.
  const expected = entries.filter(entry => firstXmlTag(entry, 'image') || firstXmlTag(entry, 'thumbnail') || firstXmlTag(entry, 'marquee')).map(entry => ({
    relative: firstXmlTag(entry, 'path'),
    media: Object.fromEntries(['image', 'thumbnail', 'marquee'].filter(field => firstXmlTag(entry, field)).map(field => [field, firstXmlTag(entry, field)]))
  }));
  if (expected.length) {
    const verify = `import json,os,xml.etree.ElementTree as ET\nroot=${JSON.stringify(remoteRoot)}\nexpected=json.loads(${JSON.stringify(JSON.stringify(expected))})\ngamelist=os.path.join(root,"gamelist.xml")\ntree=ET.parse(gamelist); by_path={g.findtext("path"):g for g in tree.getroot().findall("game")}\nfor item in expected:\n g=by_path.get(item["relative"])\n if g is None: raise RuntimeError("Artwork entry missing for "+item["relative"])\n for field,relative in item["media"].items():\n  if g.findtext(field)!=relative: raise RuntimeError(field+" link missing for "+item["relative"])\n  media=os.path.normpath(os.path.join(root,relative))\n  if not os.path.isfile(media) or os.path.getsize(media)<1: raise RuntimeError(field+" file missing for "+item["relative"])\n`;
    await execUploadedArtworkScript(device, verify);
  }
  if (ensurePresentation) await ensureArtworkPresentation(device, system);
}

const artworkPublishQueue = require('./artwork-publish-queue')(
  path.join(root, 'pending-artwork.json'),
  async job => {
    const device = await getRuntimeDevice(job.deviceName);
    if (!device) throw new Error('Scraper destination machine is unavailable.');
    await publishConsoleSystem(device, job.system, job.entries, job.artwork, job.ensurePresentation !== false);
  },
  async job => {
    const device = await getRuntimeDevice(job.deviceName);
    if (!device || device.access !== 'ssh') return;
    // Batocera's addgames API is absent or incomplete on some releases. The
    // durable gamelist is already verified; refresh EmulationStation when it
    // is idle so delayed queue recovery becomes visible without user action.
    await execSsh(device, `if pgrep -f '[r]etroarch|[x]enia|[r]pcs3|[c]emu|[d]olphin|[p]csx2' >/dev/null 2>&1; then exit 0; fi
sh -c '(batocera-es-swissknife --restart >/dev/null 2>&1 || /etc/init.d/S31emulationstation restart >/dev/null 2>&1 || (/etc/init.d/S31emulationstation stop >/dev/null 2>&1; /etc/init.d/S31emulationstation start >/dev/null 2>&1)) >/dev/null 2>&1 &'`, 15000);
    if (job.transferFileName) {
      const transfer = transferJobs.get(JSON.stringify([job.deviceName, job.system, job.transferFileName]));
      if (transfer?.completed) {
        transfer.artwork = { ...(transfer.artwork || {}), status: 'published', artwork: true };
        transfer.artworkPercent = 100;
        scheduleTransferPersistence(true);
      }
    }
  }
);
let retryingArtwork = false;
async function retryPendingArtwork() {
  if (retryingArtwork || consoleScrapeJob.running) return;
  retryingArtwork = true;
  try {
    const groups = new Map();
    for (const job of artworkPublishQueue.list().filter(job => job.nextAttempt <= Date.now())) {
      const key = `${job.deviceName}\u0000${job.system}\u0000${job.ensurePresentation !== false}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(job);
    }
    for (const jobs of groups.values()) {
      for (let offset = 0; offset < jobs.length; offset += 25) {
        await artworkPublishQueue.retryBatch(jobs.slice(offset, offset + 25).map(job => job.id));
      }
    }
  } catch (error) { console.error('Artwork publishing retry:', error.message); }
  finally { retryingArtwork = false; }
}
const artworkRetryTimer = setInterval(retryPendingArtwork, 15000);
artworkRetryTimer.unref();
const artworkStartupRetry = setTimeout(retryPendingArtwork, 1000);
artworkStartupRetry.unref();

async function existingScrapedRomNames(device, system) {
  try {
    const output = await execSsh(device, `curl -fsS http://127.0.0.1:1234/systems/${systemFolders[system]}/games`, 30000);
    const games = JSON.parse(output);
    return new Set((Array.isArray(games) ? games : []).filter(game => game.image).map(game => path.posix.basename(String(game.path || ""))));
  } catch { return new Set(); }
}

async function listBatoceraRomFiles(device, system) {
  const folder = systemFolders[system];
  const allowed = new Set(localExtensions[system] || []);
  if (!folder || !allowed.size) return [];
  const remoteRoot = `/userdata/roms/${folder}`;
  const findCommand = ["ps3", "ps4"].includes(system)
    ? `find ${shellSingleQuoted(remoteRoot)} -mindepth 1 -maxdepth 1 \\( -type f -o -type d \\) 2>/dev/null || true`
    : `find ${shellSingleQuoted(remoteRoot)} -type f 2>/dev/null || true`;
  const output = await execSsh(device, findCommand, 60000);
  const prefix = `${remoteRoot}/`;
  let files = String(output || "").split(/\r?\n/)
    .map(fileName => fileName.trim())
    .filter(fileName => fileName.startsWith(prefix))
    .map(fileName => fileName.slice(prefix.length))
    .filter(fileName => allowed.has(path.posix.extname(fileName).toLowerCase()))
    .filter(fileName => !/(^|\/)(media|images|manuals|videos)\//i.test(fileName));
  if ((localExtensions[system] || []).includes(".m3u")) {
    const playlistKeys = new Set(files
      .filter(fileName => path.posix.extname(fileName).toLowerCase() === ".m3u")
      .map(fileName => localCoverKey(path.posix.basename(fileName, path.posix.extname(fileName)))));
    files = files.filter(fileName => {
      if (path.posix.extname(fileName).toLowerCase() === ".m3u") return true;
      const parsed = multiDiscBaseName(path.posix.basename(fileName));
      return !parsed || !playlistKeys.has(localCoverKey(parsed.base));
    });
  }
  files = hideMameSupportFiles(system, files);
  if (system !== "ps1") return files;
  // A cue/bin PlayStation game is one game. The BIN is a data track, not a
  // second library entry; publish the label and artwork against the CUE/M3U.
  const playableStems = new Set(files
    .filter(fileName => [".cue", ".m3u"].includes(path.posix.extname(fileName).toLowerCase()))
    .map(fileName => fileName.slice(0, -path.posix.extname(fileName).length).toLowerCase()));
  return files.filter(fileName => path.posix.extname(fileName).toLowerCase() !== ".bin" ||
    !playableStems.has(fileName.slice(0, -path.posix.extname(fileName).length).toLowerCase()));
}

async function runConsoleScrape(device, requestedSystems, overwrite, deviceName, providerOverride = "") {
  const settings = { ...readScraperSettings(), ...(providerOverride ? { provider: providerOverride } : {}) };
  if (!settings.provider) throw new Error("Choose and save a scraper provider first.");
  if (settings.provider === "ScreenScraper" && (!settings.screenScraperUsername || !settings.screenScraperPassword || !settings.screenScraperDevId || !settings.screenScraperDevPassword)) {
    throw new Error("ScreenScraper is not configured. Enter the username, password, developer ID, and developer password.");
  }
  if (settings.provider === "TheGamesDB" && !settings.theGamesDbApiKey) throw new Error("TheGamesDB API key is not saved.");
  if (settings.provider === "IGDB" && (!settings.igdbClientId || !settings.igdbClientSecret)) throw new Error("IGDB client ID and client secret are not saved.");
  let systems = (requestedSystems?.length ? requestedSystems : Object.keys(theGamesDbPlatformIds))
    .filter(system => (["nes", "snes", "gba", "n64", "gamecube", "wii", "wiiu", "ps1", "ps2", "ps3", "ps4", "xbox", "xbox360"].includes(system) || theGamesDbPlatformIds[system]) && systemFolders[system]);
  if (settings.provider === "ArcadeDB") systems = systems.includes("mame") ? ["mame"] : [];
  const work = [];
  for (const system of systems) {
    const fileNames = await listBatoceraRomFiles(device, system);
    work.push(...fileNames.map(fileName => ({ system, fileName })));
  }
  consoleScrapeJob = { running: true, cancelled: false, total: work.length, processed: 0, matched: 0, artwork: 0, skipped: 0, systemsCompleted: 0, errors: [], current: "", finishedAt: "", provider: settings.provider || "" };
  for (const system of systems) {
    if (consoleScrapeJob.cancelled) break;
    let entries = [];
    let artwork = [];
    const publishBatch = async () => {
      if (!entries.length) return;
      const id = artworkPublishQueue.add({ deviceName, system, entries, artwork });
      if (await artworkPublishQueue.retry(id)) consoleScrapeJob.artwork += artwork.length;
      entries = [];
      artwork = [];
      persistConsoleScrapeJob();
    };
    const alreadyScraped = overwrite ? new Set() : await existingScrapedRomNames(device, system);
    // Pending metadata already has its downloaded artwork; do not spend API calls again.
    for (const pending of artworkPublishQueue.list().filter(job => job.deviceName === deviceName && job.system === system)) {
      if ((pending.artwork || []).some(item => !item.localPath || !fs.existsSync(item.localPath))) {
        artworkPublishQueue.remove(pending.id);
        continue;
      }
      for (const entry of pending.entries) alreadyScraped.add(path.posix.basename(firstXmlTag(entry, 'path')));
    }
    for (const item of work.filter(row => row.system === system)) {
      if (consoleScrapeJob.cancelled) break;
      consoleScrapeJob.current = `${systemLabels[system]} / ${item.fileName}`;
      if (alreadyScraped.has(path.posix.basename(item.fileName.replace(/\\/g, "/")))) {
        consoleScrapeJob.skipped += 1;
        consoleScrapeJob.processed += 1;
        continue;
      }
      try {
        let metadata = await scrapeConsoleGame(settings, system, item.fileName);
        if (!metadata && usesLocalOnlyArtwork(system)) {
          const image = await cacheNintendoFallbackArtwork(system, item.fileName);
          artwork.push(image);
          entries.push(consoleGameXml(consoleArtworkRomPath(system, item.fileName), { name: displayGameTitle(system, item.fileName), desc: "", releasedate: "", rating: "", players: "" }, `./media/images/${image.fileName}`));
          consoleScrapeJob.matched += 1;
          if (entries.length >= 10) await publishBatch();
        } else if (!metadata) { consoleScrapeJob.skipped += 1; }
        else {
          let image = null;
          let background = null;
          try {
            if (metadata.localImagePath) {
              if (system === "nes") {
                image = await cacheNesPictureArtwork(metadata.localImagePath, item.fileName);
              } else if (system === "snes") {
                image = await cacheSnesPictureArtwork(metadata.localImagePath, item.fileName);
              } else if (["gba", "n64", "gamecube", "wii", "wiiu", "ps1", "ps2", "ps3", "ps4", "xbox", "xbox360", "mame"].includes(system)) {
                image = await cacheNesPictureArtwork(metadata.localImagePath, item.fileName, system);
              } else {
                image = await cacheLocalConsoleArtwork(metadata.localImagePath, system, item.fileName);
              }
            } else if (metadata.imageUrl) {
              const downloaded = await downloadConsoleArtwork(metadata.imageUrl, system, item.fileName);
              if (["nes", "snes"].includes(system)) {
                background = downloaded;
                image = await cacheLocalConsoleArtwork(downloaded.localPath, system, item.fileName);
              } else image = downloaded;
            } else image = await cacheCartridgePlaceholder(system, item.fileName);
          } catch (error) { consoleScrapeJob.errors.push(`${item.fileName} artwork: ${error.message}`); }
          if (image) artwork.push(image);
          if (background && background.localPath !== image?.localPath) artwork.push(background);
          if (!image && !metadata.imageUrl && !metadata.localImagePath) consoleScrapeJob.errors.push(`${system}/${item.fileName}: provider matched the game but supplied no artwork.`);
          entries.push(consoleGameXml(consoleArtworkRomPath(system, item.fileName), metadata,
            image ? `./media/images/${image.fileName}` : ""));
          consoleScrapeJob.matched += 1;
          if (entries.length >= 10) await publishBatch();
        }
      } catch (error) {
        consoleScrapeJob.errors.push(`${system}/${item.fileName}: ${error.message}`);
        if (/developer|credentials|API key is not saved|HTTP 401|HTTP 403/i.test(error.message)) consoleScrapeJob.cancelled = true;
      }
      consoleScrapeJob.processed += 1;
      persistConsoleScrapeJob();
      await wait(300);
    }
    await publishBatch();
    consoleScrapeJob.systemsCompleted += 1;
  }
  consoleScrapeJob.running = false;
  consoleScrapeJob.current = "";
  consoleScrapeJob.finishedAt = new Date().toISOString();
  persistConsoleScrapeJob();
}

async function publishTransferredRomArtwork(device, deviceName, system, fileName, progress = () => {}) {
  progress(10, "Matching picture");
  if (device.access === "usb" || (device.platform && device.platform !== "batocera") || !systemFolders[system] || !(localExtensions[system] || []).length) {
    progress(100, "Picture not supported");
    return { status: "not-supported", matched: false, artwork: false };
  }
  if (system === "ps1" && path.posix.extname(fileName).toLowerCase() === ".bin") {
    const files = await listBatoceraRomFiles(device, system);
    const stem = fileName.slice(0, -path.posix.extname(fileName).length).toLowerCase();
    if (files.some(candidate => [".cue", ".m3u"].includes(path.posix.extname(candidate).toLowerCase()) &&
      candidate.slice(0, -path.posix.extname(candidate).length).toLowerCase() === stem)) {
      return { status: "sidecar", matched: false, artwork: false };
    }
  }
  const settings = readScraperSettings();
  const localNesArtwork = system === "nes";
  const localSnesArtwork = system === "snes";
  const localGbaArtwork = system === "gba";
  const localN64Artwork = system === "n64";
  const localGameCubeArtwork = system === "gamecube";
  const localWiiArtwork = system === "wii";
  const localWiiUArtwork = system === "wiiu";
  const localPs1Artwork = system === "ps1";
  const localPs2Artwork = system === "ps2";
  const localPs3Artwork = system === "ps3";
  const localPs4Artwork = system === "ps4";
  const localXboxArtwork = system === "xbox";
  const localXbox360Artwork = system === "xbox360";
  const localMameArtwork = system === "mame";
  if (!usesLocalOnlyArtwork(system) && !localNesArtwork && !localSnesArtwork && !localGbaArtwork && !localN64Artwork && !localGameCubeArtwork && !localWiiArtwork && !localWiiUArtwork && !localPs1Artwork && !localPs2Artwork && !localPs3Artwork && !localPs4Artwork && !localXboxArtwork && !localXbox360Artwork && !localMameArtwork && (!settings.provider || (settings.provider === "ArcadeDB" && system !== "mame"))) {
    return { status: "not-configured", matched: false, artwork: false };
  }
  let metadata = await scrapeConsoleGame(settings, system, fileName);
  progress(40, metadata ? "Picture match found" : "No Picture Matches — preparing default");
  if (!metadata && usesLocalOnlyArtwork(system)) {
    const fallbackSystem = system === "3dsen" ? "nes" : system;
    const image = styledFallbackArtworkSystems.has(fallbackSystem) && hasLocalConsoleCoverFolder(system)
      ? await cacheNintendoFallbackArtwork(fallbackSystem, fileName)
      : await cacheGenericConsoleFallbackArtwork(system, fileName);
    const fallbackMetadata = { name: displayGameTitle(system, fileName), desc: "", releasedate: "", rating: "", players: "" };
    const entries = [consoleGameXml(consoleArtworkRomPath(system, fileName), fallbackMetadata, `./media/images/${image.fileName}`)];
    // Never assume the destination already has the current layout. The first
    // transfer in a session verifies/repairs it; later transfers reuse that
    // verified result. This is especially important for GameCube, where a
    // legacy rectangular selector makes correct disc artwork look broken.
    const id = artworkPublishQueue.add({ deviceName, system, transferFileName: fileName, entries, artwork: [image], ensurePresentation: true });
    progress(75, "No Picture Matches — copying default picture");
    const published = await artworkPublishQueue.retry(id);
    progress(100, "No Picture Matches");
    return { status: published ? "published" : "queued", matched: false, artwork: true, fallback: true };
  }
  if (!metadata) {
    progress(100, "No Picture Matches");
    return { status: "unmatched", matched: false, artwork: false };
  }
  let image = null;
  let background = null;
  if (metadata.localImagePath) {
    if (localNesArtwork) {
      image = await cacheNesPictureArtwork(metadata.localImagePath, fileName);
    } else if (localSnesArtwork) {
      image = await cacheSnesPictureArtwork(metadata.localImagePath, fileName);
    } else if (localGbaArtwork || localN64Artwork || localGameCubeArtwork || localWiiArtwork || localWiiUArtwork || localPs1Artwork || localPs2Artwork || localPs3Artwork || localPs4Artwork || localXboxArtwork || localXbox360Artwork || localMameArtwork) {
      image = await cacheNesPictureArtwork(metadata.localImagePath, fileName, system);
    } else {
      if (system === "snes") background = cacheLocalConsoleBackground(metadata.localImagePath, system, fileName);
      image = await cacheLocalConsoleArtwork(metadata.localImagePath, system, fileName);
    }
  } else if (metadata.imageUrl) {
    const downloaded = await downloadConsoleArtwork(metadata.imageUrl, system, fileName);
    if (["nes", "snes"].includes(system)) { background = downloaded; image = await cacheLocalConsoleArtwork(downloaded.localPath, system, fileName); }
    else image = downloaded;
  } else image = await cacheCartridgePlaceholder(system, fileName);
  const artwork = [image, background].filter((item, index, all) => item && all.findIndex(other => other?.localPath === item.localPath) === index);
  const entries = [consoleGameXml(consoleArtworkRomPath(system, fileName), metadata, image ? `./media/images/${image.fileName}` : "")];
  const id = artworkPublishQueue.add({ deviceName, system, transferFileName: fileName, entries, artwork, ensurePresentation: true });
  progress(75, "Copying picture");
  const published = await artworkPublishQueue.retry(id);
  if (published && system === "ps1" && [".cue", ".m3u"].includes(path.posix.extname(fileName).toLowerCase())) {
    const titleKey = localCoverKey(cleanRomName(fileName));
    for (const pending of artworkPublishQueue.list().filter(job => job.deviceName === deviceName && job.system === "ps1")) {
      const pendingPath = firstXmlTag(pending.entries?.[0] || "", "path");
      if (path.posix.extname(pendingPath).toLowerCase() === ".bin" && localCoverKey(cleanRomName(pendingPath)) === titleKey) {
        artworkPublishQueue.remove(pending.id);
      }
    }
  }
  progress(100, "Picture complete");
  return { status: published ? "published" : "queued", matched: true, artwork: Boolean(image) };
}

const sftpCleanupTimer = setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [host, session] of sftpSessionCache) {
    if (session.lastUsed < cutoff) closeSftpSession(host);
  }
}, 60 * 1000);
sftpCleanupTimer.unref();

function fastPutSftp(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, sftpTransferOptions(fs.statSync(localPath).size), error => error ? reject(error) : resolve());
  });
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function localWiiUCemuSupportFiles() {
  return wiiUCemuSupportFiles.map(spec => ({ ...spec, path: path.join(wiiUCemuSupportPath, "cafeLibs", spec.name) }));
}

async function wiiUCemuSupportInstalled(sftp, client) {
  const profilePath = `/userdata/system/configs/cemu/gameProfiles/${wiiUBlackOpsProfileName}`;
  const profile = await readSftpFile(sftp, profilePath).catch(() => "");
  if (profile.replace(/\r\n/g, "\n") !== wiiUBlackOpsProfile) return false;
  for (const spec of wiiUCemuSupportFiles) {
    const remotePath = `/userdata/system/configs/cemu/cafeLibs/${spec.name}`;
    const stats = await statSftpOptional(sftp, remotePath);
    if (!stats?.size) return false;
    const output = await execOnSshClient(client, `sha256sum ${shellSingleQuoted(remotePath)}`, 60000);
    if (output.trim().split(/\s+/)[0].toLowerCase() !== spec.sha256) return false;
  }
  return true;
}

async function installWiiUCemuSupport(device) {
  const localFiles = localWiiUCemuSupportFiles();
  for (const file of localFiles) {
    if (!fs.existsSync(file.path)) throw new Error(`The bundled Wii U Cemu library is missing: ${file.name}.`);
    if (sha256File(file.path) !== file.sha256) throw new Error(`The bundled Wii U Cemu library failed verification: ${file.name}.`);
  }
  return sftpWithDevice(device, async (sftp, client) => {
    const libraryDir = "/userdata/system/configs/cemu/cafeLibs";
    const profileDir = "/userdata/system/configs/cemu/gameProfiles";
    await mkdirpSftp(sftp, libraryDir);
    await mkdirpSftp(sftp, profileDir);
    for (const file of localFiles) {
      const remotePath = `${libraryDir}/${file.name}`;
      const temporaryPath = `${remotePath}.rp1-upload`;
      await fastPutSftp(sftp, file.path, temporaryPath);
      await new Promise(resolve => sftp.unlink(remotePath, () => resolve()));
      await new Promise((resolve, reject) => sftp.rename(temporaryPath, remotePath, error => error ? reject(error) : resolve()));
    }
    const profilePath = `${profileDir}/${wiiUBlackOpsProfileName}`;
    const temporaryProfilePath = `${profilePath}.rp1-upload`;
    await writeSftpFile(sftp, temporaryProfilePath, wiiUBlackOpsProfile);
    await new Promise(resolve => sftp.unlink(profilePath, () => resolve()));
    await new Promise((resolve, reject) => sftp.rename(temporaryProfilePath, profilePath, error => error ? reject(error) : resolve()));
    await execOnSshClient(client, `chmod 644 ${shellSingleQuoted(libraryDir)}/*.rpl ${shellSingleQuoted(profilePath)} && sync`, 60000);
    if (!await wiiUCemuSupportInstalled(sftp, client)) throw new Error("Batocera did not verify the Wii U Cemu support files after installation.");
    return { installed: true, libraries: localFiles.map(file => file.name), profile: profilePath, verified: true };
  });
}

function localPs4ModuleFiles() {
  if (!fs.existsSync(ps4ModulesPath)) return [];
  return fs.readdirSync(ps4ModulesPath, {withFileTypes: true})
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".sprx"))
    .map(entry => ({name: entry.name, path: path.join(ps4ModulesPath, entry.name)}));
}

async function ps4ModulesInstalled(sftp) {
  for (const name of requiredPs4Modules) {
    const stat = await statSftpOptional(sftp, `${ps4RemoteModulesPath}/${name}`);
    if (!stat?.size) return false;
  }
  return true;
}

async function installPs4Modules(device) {
  const files = localPs4ModuleFiles();
  const names = new Set(files.map(file => file.name.toLowerCase()));
  const missing = requiredPs4Modules.filter(name => !names.has(name.toLowerCase()));
  if (!files.length) throw new Error(`No PS4 .sprx modules were found in ${ps4ModulesPath}.`);
  if (missing.length) throw new Error(`PS4 firmware modules are incomplete. Missing: ${missing.join(", ")}`);
  await sftpWithDevice(device, async (sftp, client) => {
    await execOnSshClient(client, `mkdir -p ${ps4RemoteModulesPath} && chmod 700 ${ps4RemoteModulesPath}`);
    for (const file of files) {
      const temporary = `${ps4RemoteModulesPath}/.${file.name}.upload`;
      const destination = `${ps4RemoteModulesPath}/${file.name}`;
      await fastPutSftp(sftp, file.path, temporary);
      await new Promise(resolve => sftp.unlink(destination, () => resolve()));
      await new Promise((resolve, reject) => sftp.rename(temporary, destination, error => error ? reject(error) : resolve()));
      const remote = await statSftpOptional(sftp, destination);
      if (Number(remote?.size) !== fs.statSync(file.path).size) throw new Error(`Batocera did not save the complete ${file.name} module.`);
    }
    await execOnSshClient(client, `chmod 600 ${ps4RemoteModulesPath}/*.sprx && sync`);
  });
  return {installed: true, count: files.length, remotePath: ps4RemoteModulesPath};
}

async function getPs4SystemStatus(device) {
  const command = `missing=""
test -f /userdata/system/configs/emulationstation/es_systems_ps4.cfg || missing="$missing system"
test -x /userdata/system/scripts/ready-player-one-ps4.sh || missing="$missing launcher"
test -d /userdata/roms/ps4 || missing="$missing folder"
emu=""
  for candidate in "$(command -v shadPS4 2>/dev/null)" "$(command -v shadps4 2>/dev/null)" /userdata/system/shadps4/shadPS4.AppImage /userdata/system/shadps4/shadPS4 /userdata/system/shadps4/shadps4 /userdata/system/configs/shadps4/shadPS4 /userdata/system/configs/shadps4/shadps4; do
  [ -n "$candidate" ] && [ -x "$candidate" ] && { emu="$candidate"; break; }
done
if [ -z "$emu" ]; then
  emu="$(find /userdata/system -maxdepth 6 -type f -iname 'shadps4*' -perm -111 2>/dev/null | head -n 1)"
fi
[ -n "$emu" ] || missing="$missing emulator"
if [ -z "$missing" ]; then printf 'INSTALLED:%s\\n' "$emu"; else printf 'MISSING:%s\\n' "$missing"; fi`;
  const output = (await execSsh(device, command, 30000)).trim();
  const installed = output.startsWith("INSTALLED:");
  return { installed, emulator: installed ? output.slice("INSTALLED:".length) : "", missing: installed ? [] : output.replace(/^MISSING:/, "").trim().split(/\s+/).filter(Boolean) };
}

async function ensureLocalShadPs4() {
  const cachedRoot = path.join(biosCachePath, "shadps4");
  fs.mkdirSync(cachedRoot, { recursive: true });
  const existing = listLocalFilesRecursive(cachedRoot, new Set(), cachedRoot)
    .map(name => path.join(cachedRoot, name))
    .find(file => /shadps4.*\.appimage$/i.test(path.basename(file)) && fs.statSync(file).size > 10 * 1024 * 1024);
  if (existing) return existing;
  // Also adopt an earlier RP1 cache layout so upgrades never redownload a
  // working emulator merely because the cache directory was reorganized.
  const legacy = fs.existsSync(biosCachePath) ? listLocalFilesRecursive(biosCachePath, new Set(), biosCachePath)
    .map(name => path.join(biosCachePath, name))
    .find(file => /shadps4.*\.appimage$/i.test(path.basename(file)) && fs.statSync(file).size > 10 * 1024 * 1024) : "";
  if (legacy) return legacy;
  const response = await fetchWithLimit("https://api.github.com/repos/shadps4-emu/shadPS4/releases/latest", { headers: { "User-Agent": "Ready-Player-One" } }, 30000);
  const release = await response.json();
  const asset = (release.assets || []).find(item => /shadps4-linux-sdl-.*\.zip$/i.test(item.name));
  if (!asset?.browser_download_url) throw new Error("The official shadPS4 Linux package was not found in the latest release.");
  const archiveResponse = await fetchWithLimit(asset.browser_download_url, { headers: { "User-Agent": "Ready-Player-One" } }, 120000);
  const archivePath = path.join(cachedRoot, asset.name);
  fs.writeFileSync(archivePath, Buffer.from(await archiveResponse.arrayBuffer()));
  if (fs.statSync(archivePath).size < 10 * 1024 * 1024) throw new Error("The downloaded shadPS4 package is incomplete.");
  const extractRoot = path.join(cachedRoot, path.basename(asset.name, ".zip"));
  fs.mkdirSync(extractRoot, { recursive: true });
  await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force", archivePath, extractRoot], { windowsHide: true, timeout: 120000 },
    (error, _stdout, stderr) => error ? reject(new Error(String(stderr || error.message).trim())) : resolve()));
  const emulator = listLocalFilesRecursive(extractRoot, new Set(), extractRoot)
    .map(name => path.join(extractRoot, name))
    .find(file => /shadps4.*\.appimage$/i.test(path.basename(file)) && fs.statSync(file).size > 10 * 1024 * 1024);
  if (!emulator) throw new Error("The official shadPS4 package did not contain its Linux AppImage.");
  return emulator;
}

async function installPs4System(device) {
  const localEmulator = await ensureLocalShadPs4();
  await sftpWithDevice(device, async (sftp, client) => {
    await execOnSshClient(client, "mkdir -p /userdata/system/shadps4");
    await fastPutSftp(sftp, localEmulator, "/userdata/system/shadps4/shadPS4.AppImage");
    const remote = await statSftpOptional(sftp, "/userdata/system/shadps4/shadPS4.AppImage");
    if (Number(remote?.size) !== fs.statSync(localEmulator).size) throw new Error("Batocera did not save the complete shadPS4 emulator.");
    await execOnSshClient(client, "chmod 755 /userdata/system/shadps4/shadPS4.AppImage && sync");
  });
  const command = `set -e
mkdir -p /userdata/roms/ps4 /userdata/system/scripts /userdata/system/configs/emulationstation /userdata/system/logs
emu=""
  for candidate in "$(command -v shadPS4 2>/dev/null)" "$(command -v shadps4 2>/dev/null)" /userdata/system/shadps4/shadPS4.AppImage /userdata/system/shadps4/shadPS4 /userdata/system/shadps4/shadps4 /userdata/system/configs/shadps4/shadPS4 /userdata/system/configs/shadps4/shadps4; do
  [ -n "$candidate" ] && [ -x "$candidate" ] && { emu="$candidate"; break; }
done
if [ -z "$emu" ]; then
  emu="$(find /userdata/system -maxdepth 6 -type f -iname 'shadps4*' -perm -111 2>/dev/null | head -n 1)"
fi
[ -n "$emu" ] || { echo 'shadPS4 executable was not found on this machine.' >&2; exit 1; }
printf '%s\\n' "$emu" > /userdata/system/configs/shadps4/rp1-emulator-path
for game in /userdata/roms/ps4/*; do
  [ -d "$game" ] || continue
  [ -f "$game/eboot.bin" ] || continue
  name="$(basename "$game")"
  printf '%s/eboot.bin\\n' "$name" > "/userdata/roms/ps4/$name.ps4"
done
cat > /userdata/system/configs/emulationstation/es_systems_ps4.cfg <<'EOF'
<?xml version="1.0"?>
<systemList>
  <system>
    <fullname>Sony PlayStation 4</fullname>
    <name>ps4</name>
    <manufacturer>Sony</manufacturer>
    <release>2013</release>
    <hardware>console</hardware>
    <path>/userdata/roms/ps4</path>
    <extension>.ps4 .PS4</extension>
    <command>/userdata/system/scripts/ready-player-one-ps4.sh "%ROM%"</command>
    <platform>ps4</platform>
    <theme>ps4</theme>
  </system>
</systemList>
EOF
cat > /userdata/system/scripts/ready-player-one-ps4.sh <<'EOF'
#!/bin/sh
log=/userdata/system/logs/ready-player-one-ps4.log
marker="$1"
root=/userdata/roms/ps4
target="$(head -n 1 "$marker" 2>/dev/null | tr -d '\\r')"
case "$target" in
  /*) eboot="$target" ;;
  *) eboot="$root/$target" ;;
esac
if [ ! -f "$eboot" ]; then
  candidate="$(find "$(dirname "$marker")" -maxdepth 2 -type f -name eboot.bin 2>/dev/null | head -n 1)"
  [ -n "$candidate" ] && eboot="$candidate"
fi
emu="$(cat /userdata/system/configs/shadps4/rp1-emulator-path 2>/dev/null)"
[ -x "$emu" ] || emu="$(command -v shadPS4 2>/dev/null || command -v shadps4 2>/dev/null)"
{
  echo "--- $(date) ---"
  echo "marker=$marker"
  echo "eboot=$eboot"
  echo "emulator=$emu"
} >> "$log"
[ -x "$emu" ] || { echo 'shadPS4 executable not found' >> "$log"; exit 1; }
[ -f "$eboot" ] || { echo 'eboot.bin not found' >> "$log"; exit 1; }
export HOME=/userdata/system
export XDG_CONFIG_HOME=/userdata/system/configs
export XDG_CACHE_HOME=/userdata/system/cache
export XDG_DATA_HOME=/userdata/system/.local/share
export DISPLAY="\${DISPLAY:-:0}"
# shadPS4 creates files in both the XDG locations and HOME/.local/share.
# Batocera does not create that desktop-style tree itself, so make the full
# writable runtime layout on every launch. This also self-heals a fresh drive
# or a user who removed the emulator's generated folders.
mkdir -p "$HOME/.local/share/shadPS4" "$XDG_CONFIG_HOME/shadPS4" "$XDG_CACHE_HOME/shadPS4"
[ -d "$HOME/.local/share/shadPS4" ] || { echo 'shadPS4 data directory could not be created' >> "$log"; exit 1; }
exec "$emu" -g "$eboot" --fullscreen true >> "$log" 2>&1
EOF
chmod 644 /userdata/system/configs/emulationstation/es_systems_ps4.cfg
chmod 755 /userdata/system/scripts/ready-player-one-ps4.sh
sync
echo "$emu"`;
  const emulator = (await execSsh(device, command, 60000)).trim().split(/\r?\n/).pop();
  const status = await getPs4SystemStatus(device);
  if (!status.installed) throw new Error(`PS4 setup verification failed. Missing: ${status.missing.join(", ")}`);
  await execSsh(device, 'sh -c "(batocera-es-swissknife --restart >/dev/null 2>&1 || /etc/init.d/S31emulationstation restart >/dev/null 2>&1) &"', 15000);
  return { ...status, emulator: status.emulator || emulator };
}

function statSftpOptional(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (error, stats) => {
      if (error && (error.code === 2 || /no such file/i.test(error.message || ""))) return resolve(null);
      if (error) return reject(error);
      resolve(stats);
    });
  });
}

// A single SFTP write is split into small SSH packets and waits for every
// acknowledgement before the next write. That makes a resumed disc image
// dramatically slower than a fresh fastPut. An SSH byte stream writes in
// order, so an interrupted upload still has a contiguous, resumable prefix.
function streamRomOverSsh(client, localPath, remotePath, offset, totalSize, onBytes) {
  return new Promise((resolve, reject) => {
    const command = `cat ${offset ? ">>" : ">"} ${shellSingleQuoted(remotePath)}`;
    client.exec(command, (openError, channel) => {
      if (openError) return reject(openError);
      const source = fs.createReadStream(localPath, { start: offset, highWaterMark: 1024 * 1024 });
      let settled = false;
      let sent = offset;
      let stderr = "";
      let idleTimer;
      const armIdleTimer = (atEnd = false) => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => fail(new Error(
          atEnd ? "SSH upload completion timed out." : "SSH upload stopped making progress."
        )), atEnd ? 45000 : 120000);
      };
      const fail = error => {
        if (settled) return;
        settled = true;
        clearTimeout(idleTimer);
        source.destroy();
        channel.close();
        reject(error);
      };
      source.on("error", fail);
      channel.on("error", fail);
      channel.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-2048); });
      source.on("data", chunk => {
        sent += chunk.length;
        try { onBytes?.(sent, totalSize, false); }
        catch (error) { fail(error); }
        if (!settled) armIdleTimer(sent >= totalSize);
      });
      channel.on("close", code => {
        if (settled) return;
        settled = true;
        clearTimeout(idleTimer);
        if (code !== 0 || sent !== totalSize) {
          reject(new Error(`SSH upload stopped (${code ?? "unknown"}): ${stderr.trim() || `${sent}/${totalSize} bytes sent`}`));
        } else resolve();
      });
      armIdleTimer();
      source.pipe(channel);
    });
  });
}

async function resumablePutSftp(sftp, localPath, remotePath, onBytes, client = null) {
  const localSize = fs.statSync(localPath).size;
  const remoteStats = await statSftpOptional(sftp, remotePath);
  const remoteSize = Number(remoteStats?.size || 0);
  if (remoteStats && remoteSize === localSize) {
    onBytes?.(localSize, localSize, true);
    return { bytes: localSize, resumedFrom: localSize, skipped: true };
  }
  if (localSize === 0) {
    await new Promise((resolve, reject) => {
      sftp.writeFile(remotePath, Buffer.alloc(0), error => error ? reject(error) : resolve());
    });
    onBytes?.(0, 0, false);
    return { bytes: 0, resumedFrom: 0, skipped: false };
  }
  // A fresh large image should use fastPut's pipelined writes. The ordered
  // SSH stream is only needed to append to an existing partial image; using
  // it for every new image throttles transfers on some Batocera SSH servers.
  if (client && localSize > 50 * 1024 * 1024 && remoteSize > 0 && remoteSize < localSize) {
    onBytes?.(remoteSize, localSize, false);
    await streamRomOverSsh(client, localPath, remotePath, remoteSize, localSize, onBytes);
    return { bytes: localSize, resumedFrom: remoteSize, skipped: false };
  }
  if (remoteSize <= 0 || remoteSize > localSize) {
    await new Promise((resolve, reject) => {
      let settled = false;
      let idleTimer;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(idleTimer);
        error ? reject(error) : resolve();
      };
      const armIdleTimer = (atEnd = false) => {
        clearTimeout(idleTimer);
        // fastPut can report every byte queued before its final SFTP write
        // acknowledgements arrive. Never leave a completed-looking transfer
        // running forever; the dedicated connection will be closed and the
        // saved .bw-part file verified/resumed on the next attempt.
        idleTimer = setTimeout(() => finish(new Error(
          atEnd ? "SFTP upload completion timed out." : "SFTP upload stopped making progress."
        )), atEnd ? 45000 : 120000);
      };
      armIdleTimer();
      sftp.fastPut(localPath, remotePath, {
        ...sftpTransferOptions(localSize),
        step: transferred => {
          if (settled) return;
          try { onBytes?.(transferred, localSize, false); }
          catch (error) { finish(error); return; }
          armIdleTimer(transferred >= localSize);
        }
      }, finish);
    });
    return { bytes: localSize, resumedFrom: 0, skipped: false };
  }

  onBytes?.(remoteSize, localSize, false);
  const localHandle = await fs.promises.open(localPath, "r");
  const remoteHandle = await new Promise((resolve, reject) => {
    sftp.open(remotePath, "r+", (error, handle) => error ? reject(error) : resolve(handle));
  });
  try {
    const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
    let position = remoteSize;
    while (position < localSize) {
      const length = Math.min(buffer.length, localSize - position);
      const { bytesRead } = await localHandle.read(buffer, 0, length, position);
      if (!bytesRead) throw new Error(`Unexpected end of local file: ${localPath}`);
      await new Promise((resolve, reject) => {
        sftp.write(remoteHandle, buffer, 0, bytesRead, position, error => error ? reject(error) : resolve());
      });
      position += bytesRead;
      onBytes?.(position, localSize, false);
    }
  } finally {
    await localHandle.close().catch(() => {});
    await new Promise(resolve => sftp.close(remoteHandle, () => resolve()));
  }
  return { bytes: localSize, resumedFrom: remoteSize, skipped: false };
}

const ps1BiosByMd5 = {
  c53ca5908936d412331790f4426c6c33: "psxonpsp660.bin",
  "6e3735ff4c7dc899ee98981385f6f3d0": "scph101.bin",
  dc2b9bf8da62ec93e868cfd29f0d067d: "scph1001.bin",
  "924e392ed05558ffdb115408c263dccf": "scph1001.bin",
  "8dd7d5296a650fac7319bce665a6a53c": "scph5500.bin",
  "490f666e1afb15b7362b406ed1cea246": "scph5501.bin",
  "32736f17079d0b2b7024407c39bd3050": "scph5502.bin",
  "1e68c231d0896b7eadcad1d7d8e76129": "scph7001.bin"
};

async function installPs1Bios(device, encodedData) {
  const data = Buffer.from(String(encodedData || ""), "base64");
  if (!data.length || data.length > 1024 * 1024) {
    throw new Error("Select a valid PS1 BIOS file no larger than 1 MB.");
  }

  const md5 = crypto.createHash("md5").update(data).digest("hex");
  const fileName = ps1BiosByMd5[md5];
  if (!fileName) {
    throw new Error(`Unrecognized PS1 BIOS (MD5 ${md5}). Use a BIOS dumped from your own PlayStation.`);
  }

  const remotePath = `/userdata/bios/${fileName}`;
  fs.mkdirSync(biosCachePath, { recursive: true });
  fs.writeFileSync(path.join(biosCachePath, fileName), data, { mode: 0o600 });
  await sftpWithDevice(device, async sftp => {
    await new Promise((resolve, reject) => {
      sftp.writeFile(remotePath, data, error => error ? reject(error) : resolve());
    });
    const installedSize = await new Promise((resolve, reject) => {
      sftp.stat(remotePath, (error, attrs) => error ? reject(error) : resolve(Number(attrs.size)));
    });
    if (installedSize !== data.length) {
      throw new Error("Batocera did not save the complete PS1 BIOS file.");
    }
  });
  return { fileName, md5, remotePath, verified: true, bytes: data.length };
}

const largeBiosInstallers = {
  ps2: {
    md5: "21038400dc633070a78ad53090c53017",
    fileName: "ps2-0230a-20080220.bin",
    remoteDir: "/userdata/bios/ps2",
    maxBytes: 8 * 1024 * 1024
  },
  ps3: {
    md5: "05fe32f5dc8c78acbcd84d36ee7fdc5b",
    acceptedMd5: [
      "05fe32f5dc8c78acbcd84d36ee7fdc5b", // Official firmware 4.90
      "3694eb3fb8d9915c112e6ab41a60c69f", // Official firmware 4.91
      "c179ad173bbc08b55431d30947725a4b", // Official firmware 4.92
      "a2b60b6ac1d2e49e230144345616927c"  // Official firmware 4.93
    ],
    fileName: "PS3UPDAT.PUP",
    remoteDir: "/userdata/bios",
    maxBytes: 512 * 1024 * 1024
  }
};

const medicinePs2Bios = require('./medicine-ps2-bios')({
  root, cachePath: biosCachePath, spec: largeBiosInstallers.ps2,
  execSsh, installCached: installCachedLargeBios
});

const xboxBiosInstallers = {
  "mcpx_1.0.bin": { md5: "d49c52a4102f6df7bcf8d0617ac475ed", maxBytes: 1024 },
  "complex_4627.bin": { md5: "39cee882148a87f93cb440b99dde3ceb", maxBytes: 2 * 1024 * 1024, fileName: "Complex_4627.bin" }
};

async function installXboxBios(req, device, requestedName) {
  const key = String(requestedName || "").toLowerCase();
  const installer = xboxBiosInstallers[key];
  if (!installer) throw new Error("Select mcpx_1.0.bin or Complex_4627.bin.");
  const fileName = installer.fileName || key;
  const chunks = [];
  let size = 0;
  await new Promise((resolve, reject) => {
    req.on("data", chunk => {
      size += chunk.length;
      if (size > installer.maxBytes) {
        reject(new Error(`${fileName} is too large.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", resolve);
    req.on("error", reject);
  });
  const data = Buffer.concat(chunks);
  const md5 = crypto.createHash("md5").update(data).digest("hex");
  if (!data.length || md5 !== installer.md5) {
    throw new Error(`Unrecognized ${fileName} (MD5 ${md5}). Use your verified original-Xbox BIOS dump.`);
  }
  fs.mkdirSync(biosCachePath, { recursive: true });
  fs.writeFileSync(path.join(biosCachePath, fileName), data, { mode: 0o600 });
  const remotePath = `/userdata/bios/${fileName}`;
  await sftpWithDevice(device, sftp => new Promise((resolve, reject) => {
    sftp.writeFile(remotePath, data, error => error ? reject(error) : resolve());
  }));
  return { fileName, md5, remotePath, verified: true, bytes: data.length };
}

function biosHashIsAccepted(installer, md5) {
  return (installer.acceptedMd5 || [installer.md5]).includes(md5);
}

async function installLargeBios(req, device, system) {
  const installer = largeBiosInstallers[system];
  if (!installer) throw new Error("Unknown BIOS system.");
  fs.mkdirSync(biosCachePath, { recursive: true });
  const temporaryCachePath = path.join(biosCachePath, `.${installer.fileName}.upload`);
  const cachedPath = path.join(biosCachePath, installer.fileName);
  const hash = crypto.createHash("md5");
  let size = 0;
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(temporaryCachePath, { mode: 0o600 });
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      output.destroy();
      reject(error);
    };
    req.on("data", chunk => {
      size += chunk.length;
      if (size > installer.maxBytes) return fail(new Error(`${system.toUpperCase()} BIOS file is too large.`));
      hash.update(chunk);
    });
    req.on("error", fail);
    output.on("error", fail);
    output.on("finish", () => { if (!settled) { settled = true; resolve(); } });
    req.pipe(output);
  });
  const md5 = hash.digest("hex");
  if (!size || !biosHashIsAccepted(installer, md5)) {
    fs.rmSync(temporaryCachePath, { force: true });
    throw new Error(`Unrecognized ${system.toUpperCase()} BIOS/firmware (MD5 ${md5}). Use the file required by this Batocera version.`);
  }
  fs.rmSync(cachedPath, { force: true });
  fs.renameSync(temporaryCachePath, cachedPath);
  return installCachedLargeBios(device, system);
}

function cachedBiosStatus() {
  medicinePs2Bios.cache();
  fs.mkdirSync(biosCachePath, { recursive: true });
  const ps1File = Object.values(ps1BiosByMd5).find(fileName => fs.existsSync(path.join(biosCachePath, fileName))) || "";
  const wiiuKeysPath = path.join(biosCachePath, "cemu", "keys.txt");
  let wiiuKeyCount = 0;
  try {
    wiiuKeyCount = fs.readFileSync(wiiuKeysPath, "utf8").split(/\r?\n/)
      .filter(line => /^[0-9a-f]{32}(?:\s*(?:=|#).*)?$/i.test(line.trim())).length;
  } catch {}
  const ps4Names = new Set(localPs4ModuleFiles().map(file => file.name.toLowerCase()));
  const xboxCached = Object.entries(xboxBiosInstallers).every(([key, installer]) =>
    fs.existsSync(path.join(biosCachePath, installer.fileName || key)));
  return {
    ps1: { cached: Boolean(ps1File), fileName: ps1File },
    ps2: { cached: fs.existsSync(path.join(biosCachePath, largeBiosInstallers.ps2.fileName)), fileName: largeBiosInstallers.ps2.fileName },
    ps3: { cached: fs.existsSync(path.join(biosCachePath, largeBiosInstallers.ps3.fileName)), fileName: largeBiosInstallers.ps3.fileName },
    ps4: { cached: requiredPs4Modules.every(name => ps4Names.has(name.toLowerCase())), fileName: "15 shadPS4 .sprx modules" },
    wiiu: { cached: wiiuKeyCount > 0, fileName: "keys.txt", keyCount: wiiuKeyCount },
    xbox: { cached: xboxCached, fileName: "mcpx_1.0.bin and Complex_4627.bin" }
  };
}

function medicineDownloadFiles() {
  const downloads = path.join(os.homedir(), "Downloads");
  const files = [];
  const visit = (folder, depth = 0) => {
    if (depth > 3 || !fs.existsSync(folder)) return;
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const fullPath = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(fullPath, depth + 1);
      else if (entry.isFile()) files.push({ name: entry.name, path: fullPath, size: fs.statSync(fullPath).size });
    }
  };
  visit(path.join(path.dirname(root), 'RP1 Medicine', 'roms'));
  visit(downloads);
  return { downloads, files };
}

async function installMedicineFiles(device) {
  const { downloads, files } = medicineDownloadFiles();
  const installed = [], ignored = [];
  const byName = name => files.find(file => file.name.toLowerCase() === name.toLowerCase());
  const md5 = file => crypto.createHash("md5").update(fs.readFileSync(file.path)).digest("hex");
  const ps1 = files.find(file => file.size <= 1024 * 1024 && file.name.toLowerCase().endsWith(".bin") && ps1BiosByMd5[md5(file)]);
  if (ps1) { await installPs1Bios(device, fs.readFileSync(ps1.path).toString("base64")); installed.push("PS1 BIOS"); }
  fs.mkdirSync(biosCachePath, { recursive: true });
  for (const system of ["ps2", "ps3"]) {
    const spec = largeBiosInstallers[system], source = byName(spec.fileName);
    if (!source) continue;
    if (!biosHashIsAccepted(spec, md5(source))) { ignored.push(`${source.name} (verification failed)`); continue; }
    fs.copyFileSync(source.path, path.join(biosCachePath, spec.fileName));
    await installCachedLargeBios(device, system); installed.push(`${system.toUpperCase()} firmware`);
  }
  const modules = requiredPs4Modules.map(byName);
  if (modules.every(Boolean)) {
    fs.mkdirSync(ps4ModulesPath, { recursive: true });
    for (const module of modules) fs.copyFileSync(module.path, path.join(ps4ModulesPath, module.name));
    await installPs4Modules(device); installed.push("PS4 firmware modules");
  }
  const keys = files.find(file => file.name.toLowerCase() === "keys.txt" && fs.readFileSync(file.path,"utf8").split(/\r?\n/).some(line => /^[0-9a-f]{32}(?:\s*(?:=|#).*)?$/i.test(line.trim())));
  if (keys) {
    const content=fs.readFileSync(keys.path,"utf8").trim();
    await sftpWithDevice(device, async (sftp,client)=>{await execOnSshClient(client,"mkdir -p /userdata/bios/cemu && chmod 700 /userdata/bios/cemu");await writeSftpFile(sftp,"/userdata/bios/cemu/keys.txt",`${content}\n`);await execOnSshClient(client,"chmod 600 /userdata/bios/cemu/keys.txt && sync");});
    fs.mkdirSync(path.join(biosCachePath,"cemu"),{recursive:true});fs.copyFileSync(keys.path,path.join(biosCachePath,"cemu","keys.txt"));await installWiiUCemuSupport(device);installed.push("Wii U keys and Cemu support files");
  }
  const xbox = [];
  for (const [requested,spec] of Object.entries(xboxBiosInstallers)) { const source=byName(spec.fileName||requested); if(source&&md5(source)===spec.md5)xbox.push({source,name:spec.fileName||requested}); }
  if (xbox.length) { await sftpWithDevice(device,async(sftp,client)=>{await execOnSshClient(client,"mkdir -p /userdata/bios");for(const item of xbox)await fastPutSftp(sftp,item.source.path,`/userdata/bios/${item.name}`);await execOnSshClient(client,"sync");});installed.push(`Xbox BIOS (${xbox.length}/2 files)`); }
  return { installed, downloads, summary: installed.length ? `Installed and verified:\n• ${installed.join("\n• ")}${ignored.length?`\n\nSkipped:\n• ${ignored.join("\n• ")}`:""}` : `No recognized, verified BIOS, firmware, or key sets were found under ${downloads}. Nothing was changed.` };
}

async function installCachedPs1Bios(device) {
  const status = cachedBiosStatus().ps1;
  if (!status.cached) throw new Error("No verified PS1 BIOS is cached yet.");
  const data = fs.readFileSync(path.join(biosCachePath, status.fileName));
  return installPs1Bios(device, data.toString("base64"));
}

async function installCachedLargeBios(device, system) {
  if (system === 'ps2') medicinePs2Bios.cache();
  const installer = largeBiosInstallers[system];
  if (!installer) throw new Error("Unknown BIOS system.");
  const cachedPath = path.join(biosCachePath, installer.fileName);
  if (!fs.existsSync(cachedPath)) throw new Error(`No verified ${system.toUpperCase()} file is cached yet.`);
  const size = fs.statSync(cachedPath).size;
  const md5 = crypto.createHash("md5").update(fs.readFileSync(cachedPath)).digest("hex");
  if (!biosHashIsAccepted(installer, md5)) throw new Error(`The cached ${system.toUpperCase()} file failed verification.`);
  const remotePath = `${installer.remoteDir}/${installer.fileName}`;
  const temporaryPath = `${installer.remoteDir}/.${installer.fileName}.upload`;
  await sftpWithDevice(device, async sftp => {
    await mkdirpSftp(sftp, installer.remoteDir);
    await fastPutSftp(sftp, cachedPath, temporaryPath);
    await new Promise(resolve => sftp.unlink(remotePath, () => resolve()));
    await new Promise((resolve, reject) => sftp.rename(temporaryPath, remotePath, error => error ? reject(error) : resolve()));
    const installedSize = await new Promise((resolve, reject) => sftp.stat(remotePath, (error, attrs) => error ? reject(error) : resolve(Number(attrs.size))));
    if (installedSize !== size) throw new Error(`Batocera did not save the complete ${system.toUpperCase()} file.`);
  });
  return { system, fileName: installer.fileName, md5, remotePath, verified: true, bytes: size, cached: true };
}

function remoteDirFor(system,device) {
  if(device?.platform==='lakka'){
    const folder=systemFolders[system];
    if(!folder)throw new Error(`Unknown system: ${system}`);
    return `/storage/roms/${folder}`;
  }
  if(device?.platform==='recalbox'){
    if(system==='music')return '/recalbox/share/music';
    const folder=systemFolders[system];
    if(!folder)throw new Error(`Unknown system: ${system}`);
    return `/recalbox/share/roms/${folder}`;
  }
  if (system === "music") {
    return "/userdata/music";
  }

  const folder = systemFolders[system];
  if (!folder) {
    throw new Error(`Unknown system: ${system}`);
  }

  return `/userdata/roms/${folder}`;
}

function safeLocalRomPath(system, fileName) {
  const folder = localFolders[system];
  if (!folder || !fileName) {
    throw new Error("Invalid ROM path.");
  }

  if (system !== "music" && (fileName.includes("/") || fileName.includes("\\"))) {
    throw new Error("Invalid ROM path.");
  }

  const absolute = path.join(root, folder, fileName);
  const allowedRoot = path.join(root, folder);
  const relative = path.relative(allowedRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(absolute)) {
    throw new Error(system === "music" || system === "karaoke" ? "Local song file was not found." : "Local game file was not found.");
  }

  return absolute;
}

const localTransferSizeCache = new Map();
function collapsePs1Sidecars(names) {
  const allNames = new Set(names.map(name => String(name).replace(/\\/g, "/").toLowerCase()));
  return names.filter(name => {
    const normalized = String(name).replace(/\\/g, "/");
    if (path.posix.extname(normalized).toLowerCase() !== ".bin") return true;
    const stem = normalized.slice(0, -path.posix.extname(normalized).length).toLowerCase();
    return !allNames.has(`${stem}.cue`) && !allNames.has(`${stem}.m3u`);
  });
}

function multiDiscBaseName(fileName) {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  const match = stem.match(/(?:\s*[-_.]?\s*)[\[(]?(?:disc|disk|cd|dvd)\s*[-_. ]?\s*0*(\d+)(?:\s*(?:of|\/)\s*\d+)?[\])]?(?=$|[\s._-])/i);
  if (!match) return null;
  const base = `${stem.slice(0, match.index)} ${stem.slice(match.index + match[0].length)}`.replace(/\s+/g, " ").trim();
  return base ? { base, disc: Number(match[1]) } : null;
}

function collapseLogicalMultiDiscEntries(system, names) {
  const groups = new Map();
  const playlists = new Map(names
    .filter(name => path.extname(name).toLowerCase() === ".m3u")
    .map(name => [localCoverKey(path.basename(name, path.extname(name))), name]));
  for (const name of names) {
    if (path.extname(name).toLowerCase() === ".m3u") continue;
    const parsed = multiDiscBaseName(path.basename(name));
    if (!parsed) continue;
    const key = localCoverKey(parsed.base);
    const group = groups.get(key) || { title: parsed.base, discs: [] };
    group.discs.push({ name, disc: parsed.disc });
    groups.set(key, group);
  }
  const primaryByName = new Map();
  const hidden = new Set();
  for (const [key, group] of groups) {
    group.discs.sort((left, right) => left.disc - right.disc || left.name.localeCompare(right.name, undefined, { numeric: true }));
    if (group.discs.length < 2 || new Set(group.discs.map(item => item.disc)).size < 2) continue;
    const playlist = playlists.get(key);
    const primary = playlist || group.discs[0].name;
    group.discs.forEach(item => hidden.add(item.name.toLowerCase()));
    primaryByName.set(primary.toLowerCase(), {
      title: group.title,
      files: group.discs.map(item => item.name),
      count: group.discs.length
    });
  }
  const rows = [];
  for (const name of names) {
    const key = name.toLowerCase();
    const discSet = primaryByName.get(key);
    if (hidden.has(key) && !discSet) continue;
    const extension = path.extname(name).slice(1).toUpperCase() || system.toUpperCase();
    // Keep the launcher/file format independent from the logical disc count.
    // The UI renders discSet.count beside the title; replacing type with
    // "2 DISCS" here hides whether Batocera will launch M3U, ISO, CHD, etc.
    rows.push({ name, type: extension, discSet });
  }
  return rows;
}

function ensureMultiDiscPlaylists(system, folderPath) {
  if (!(localExtensions[system] || []).includes('.m3u') || !fs.existsSync(folderPath)) return;
  const allowed = new Set((localExtensions[system] || []).filter(extension => extension !== '.m3u'));
  const groups = new Map();
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const entryNames = new Set(entries.filter(entry => entry.isFile()).map(entry => entry.name.toLowerCase()));
  for (const entry of entries) {
    if (!entry.isFile() || !allowed.has(path.extname(entry.name).toLowerCase())) continue;
    if (path.extname(entry.name).toLowerCase() === '.bin' && entryNames.has(`${path.basename(entry.name, path.extname(entry.name)).toLowerCase()}.cue`)) continue;
    const parsed = multiDiscBaseName(entry.name);
    if (!parsed) continue;
    const key = localCoverKey(parsed.base);
    const group = groups.get(key) || { base: parsed.base, discs: [] };
    group.discs.push({ name: entry.name, disc: parsed.disc });
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const discs = group.discs.sort((left, right) => left.disc - right.disc || left.name.localeCompare(right.name));
    if (discs.length < 2 || new Set(discs.map(item => item.disc)).size < 2) continue;
    const playlistPath = path.join(folderPath, `${group.base}.m3u`);
    const contents = `${discs.map(item => item.name).join('\n')}\n`;
    if (!fs.existsSync(playlistPath) || fs.readFileSync(playlistPath, 'utf8') !== contents) fs.writeFileSync(playlistPath, contents);
  }
}

function collapseMultiDiscSidecars(system, names, folderPath) {
  if (!(localExtensions[system] || []).includes('.m3u')) return names;
  const hidden = new Set();
  for (const playlist of names.filter(name => path.extname(name).toLowerCase() === '.m3u')) {
    const playlistPath = path.join(folderPath, playlist);
    if (!fs.existsSync(playlistPath)) continue;
    for (const line of fs.readFileSync(playlistPath, 'utf8').split(/\r?\n/)) {
      const candidate = line.trim();
      if (candidate && !candidate.startsWith('#') && !candidate.includes('/') && !candidate.includes('\\')) hidden.add(candidate.toLowerCase());
    }
  }
  return names.filter(name => !hidden.has(name.toLowerCase()));
}

function collapseRemoteMultiDiscEntries(system, names) {
  return collapseLogicalMultiDiscEntries(system, names);
}

function ps1TransferFiles(system, fileName) {
  const primaryPath = safeLocalRomPath(system, fileName);
  const files = [{ name: fileName, localPath: primaryPath }];
  if ((localExtensions[system] || []).includes('.m3u') && path.extname(fileName).toLowerCase() === '.m3u' && fs.statSync(primaryPath).isFile()) {
    const rootDir = path.join(root, localFolders[system]);
    for (const line of fs.readFileSync(primaryPath, 'utf8').split(/\r?\n/)) {
      const reference = line.trim();
      if (!reference || reference.startsWith('#')) continue;
      const localPath = path.resolve(path.dirname(primaryPath), reference.replace(/\\/g, path.sep));
      const relative = path.relative(rootDir, localPath);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(localPath) || !fs.statSync(localPath).isFile()) continue;
      const name = relative.replace(/\\/g, '/');
      if (!files.some(item => item.name.toLowerCase() === name.toLowerCase())) files.push({ name, localPath });
    }
    return files;
  }
  const parsedDisc = multiDiscBaseName(fileName);
  if (parsedDisc && fs.statSync(primaryPath).isFile()) {
    const folderPath = path.join(root, localFolders[system]);
    const groupKey = localCoverKey(parsedDisc.base);
    const siblings = fs.readdirSync(folderPath, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => ({ name: entry.name, parsed: multiDiscBaseName(entry.name) }))
      .filter(item => item.parsed && localCoverKey(item.parsed.base) === groupKey)
      .sort((left, right) => left.parsed.disc - right.parsed.disc || left.name.localeCompare(right.name, undefined, { numeric: true }));
    if (siblings.length > 1 && new Set(siblings.map(item => item.parsed.disc)).size > 1) {
      return siblings.map(item => ({ name: item.name, localPath: path.join(folderPath, item.name) }));
    }
  }
  if (system !== "ps1" || path.extname(fileName).toLowerCase() !== ".cue" || !fs.statSync(primaryPath).isFile()) return files;
  const baseDir = path.dirname(primaryPath);
  const rootDir = path.join(root, localFolders[system]);
  const referenced = [...fs.readFileSync(primaryPath, "utf8").matchAll(/^\s*FILE\s+(?:"([^"]+)"|(\S+))/gim)]
    .map(match => match[1] || match[2])
    .filter(Boolean);
  for (const reference of referenced) {
    const localPath = path.resolve(baseDir, reference.replace(/\\/g, path.sep));
    const relative = path.relative(rootDir, localPath);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(localPath) || !fs.statSync(localPath).isFile()) continue;
    const name = path.relative(rootDir, localPath).replace(/\\/g, "/");
    if (!files.some(item => item.name.toLowerCase() === name.toLowerCase())) files.push({ name, localPath });
  }
  return files;
}

const mameSharedDependencies = {
  gtfore06: ["iteagle.zip"]
};

const hiddenMameSupportFiles = new Set(Object.values(mameSharedDependencies).flat().map(name => name.toLowerCase()));
function hideMameSupportFiles(system, names) {
  return system === "mame"
    ? names.filter(name => !hiddenMameSupportFiles.has(path.basename(String(name)).toLowerCase()))
    : names;
}

function uploadTransferFiles(system, fileName) {
  const files = ps1TransferFiles(system, fileName);
  if (system !== "mame") return files;
  const rootDir = path.join(root, localFolders.mame);
  const shortName = path.basename(fileName, path.extname(fileName)).toLowerCase();
  const diskFolder = path.join(rootDir, shortName);
  if (fs.existsSync(diskFolder) && fs.statSync(diskFolder).isDirectory()) {
    for (const relativeFile of listLocalFilesRecursive(diskFolder, new Set(), diskFolder)) {
      files.push({
        name: `${shortName}/${relativeFile.replace(/\\/g, "/")}`,
        localPath: path.join(diskFolder, relativeFile)
      });
    }
  }
  for (const dependency of mameSharedDependencies[shortName] || []) {
    const localPath = path.join(rootDir, dependency);
    if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
      files.push({ name: dependency, localPath });
    }
  }
  return files.filter((item, index, list) =>
    list.findIndex(candidate => candidate.name.toLowerCase() === item.name.toLowerCase()) === index
  );
}

function localTransferSize(system, fileName) {
  const localPath = safeLocalRomPath(system, fileName);
  const stats = fs.statSync(localPath);
  const signature = `${stats.isDirectory() ? "d" : "f"}:${stats.mtimeMs}:${stats.size}`;
  const cached = localTransferSizeCache.get(localPath);
  if (cached?.signature === signature) return cached.value;
  if (stats.isFile()) {
    const files = uploadTransferFiles(system, fileName);
    const sizes = files.map(item => Number(fs.statSync(item.localPath).size));
    const value = { totalBytes: sizes.reduce((sum, size) => sum + size, 0), largestFileBytes: Math.max(...sizes), fileCount: files.length };
    localTransferSizeCache.set(localPath, { signature, value });
    return value;
  }
  const relativeFiles = listLocalFilesRecursive(localPath, new Set(), localPath);
  let totalBytes = 0;
  let largestFileBytes = 0;
  for (const relativeFile of relativeFiles) {
    const size = Number(fs.statSync(path.join(localPath, relativeFile)).size);
    totalBytes += size;
    largestFileBytes = Math.max(largestFileBytes, size);
  }
  const value = { totalBytes, largestFileBytes, fileCount: relativeFiles.length };
  localTransferSizeCache.set(localPath, { signature, value });
  return value;
}

function listLocalFilesRecursive(folderPath, allowedExtensions, basePath = folderPath) {
  if (!fs.existsSync(folderPath)) {
    return [];
  }

  return fs.readdirSync(folderPath, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(folderPath, entry.name);
    if (entry.isDirectory()) {
      return listLocalFilesRecursive(absolute, allowedExtensions, basePath);
    }

    if (!entry.isFile() || (allowedExtensions.size && !allowedExtensions.has(path.extname(entry.name).toLowerCase()))) {
      return [];
    }

    return path.relative(basePath, absolute).replace(/\\/g, "/");
  });
}

function hasXbox360Launcher(folderPath) {
  return listLocalFilesRecursive(folderPath, new Set([".xbox360"])).length > 0;
}

function hasPs4Launcher(folderPath) {
  return listLocalFilesRecursive(folderPath, new Set([".ps4"])).length > 0;
}

function musicFolderRows(fileNames, baseNote) {
  const groups = new Map();
  fileNames.forEach(name => {
    const parts = name.split("/");
    const folder = parts.length > 1 ? parts[0] : path.basename(name, path.extname(name));
    const current = groups.get(folder) || { count: 0, extensions: new Set(), tracks: [] };
    current.count += 1;
    current.extensions.add(path.extname(name).slice(1).toUpperCase());
    current.tracks.push(parts.length > 1 ? parts.slice(1).join("/") : name);
    groups.set(folder, current);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([folder, info]) => {
      const extensions = [...info.extensions].sort().join("/");
      const tracks = info.tracks.sort((a, b) => a.localeCompare(b));
      return [folder, `${baseNote} / ${info.count} track${info.count === 1 ? "" : "s"}`, extensions || "MP3/FLAC", "OK", "folder", tracks];
    });
}

function isExcludedLibraryGame(system, fileName) {
  // 2048 is an NES homebrew/demo that older RP1 fallback data and some
  // preloaded images exposed as though it were part of the normal library.
  // It is intentionally excluded from discovery, queues, and uploads.
  return system === "nes" && /^2048(?:[^0-9]|$)/i.test(path.basename(String(fileName || ""), path.extname(String(fileName || ""))));
}

async function removeExcludedNes2048FromBatocera(device) {
  if (!device || device.access !== "ssh") return { removed: 0 };
  const script = String.raw`import os, re, xml.etree.ElementTree as ET
root = '/userdata/roms/nes'
blocked = re.compile(r'^2048(?:[^0-9]|$)', re.I)
removed = 0
for base, dirs, files in os.walk(root):
    for name in files:
        stem = os.path.splitext(name)[0]
        if blocked.match(stem):
            try:
                os.remove(os.path.join(base, name))
                removed += 1
            except FileNotFoundError:
                pass
gamelist = os.path.join(root, 'gamelist.xml')
if os.path.isfile(gamelist):
    try:
        tree = ET.parse(gamelist)
        document = tree.getroot()
        changed = False
        for game in list(document.findall('game')):
            game_path = game.findtext('path') or ''
            stem = os.path.splitext(os.path.basename(game_path.replace('\\', '/')))[0]
            if blocked.match(stem):
                document.remove(game)
                changed = True
        if changed:
            tree.write(gamelist, encoding='utf-8', xml_declaration=True)
    except (ET.ParseError, OSError):
        pass
print('REMOVED=' + str(removed))`;
  const payload = Buffer.from(script, "utf8").toString("base64");
  const output = await execSsh(device, `printf '%s' '${payload}' | base64 -d | python3`, 30000);
  return { removed: Number(String(output || "").match(/REMOVED=(\d+)/)?.[1] || 0) };
}

function listLocalLibrary() {
  return Object.fromEntries(Object.entries(localFolders).map(([system, folder]) => {
    const label = systemLabels[system] || system.toUpperCase();
    const folderPath = path.join(root, folder);
    const allowedExtensions = new Set(localExtensions[system] || []);
    ensureMultiDiscPlaylists(system, folderPath);
    let names = system === "music"
      ? listLocalFilesRecursive(folderPath, allowedExtensions)
      : fs.existsSync(folderPath)
        ? fs.readdirSync(folderPath, { withFileTypes: true })
          .filter(entry => entry.isFile() ||
            (["ports", "pygame", "windows"].includes(system) && entry.isDirectory()) ||
            (system === "ps3" && entry.isDirectory() && path.extname(entry.name).toLowerCase() === ".ps3") ||
            (system === "ps4" && entry.isDirectory() && (path.extname(entry.name).toLowerCase() === ".ps4" || hasPs4Launcher(path.join(folderPath, entry.name)))) ||
            (system === "xbox360" && entry.isDirectory() && hasXbox360Launcher(path.join(folderPath, entry.name))))
          .map(entry => entry.name)
          .filter(name => (["ps4", "xbox360", "ports", "pygame", "windows"].includes(system) && fs.statSync(path.join(folderPath, name)).isDirectory()) || allowedExtensions.has(path.extname(name).toLowerCase()))
        : [];
    names = hideMameSupportFiles(system, names);
    names = names.filter(name => !isExcludedLibraryGame(system, name));
    if (system === "ps1") names = collapsePs1Sidecars(names);
    const logicalEntries = system === "music"
      ? names.map(name => ({ name, type: path.extname(name).slice(1).toUpperCase() || label }))
      : collapseLogicalMultiDiscEntries(system, names);
    const warehouse = system === "music"
      ? musicFolderRows(names, "This computer / music")
      : logicalEntries
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map(entry => {
          const name = entry.name;
          const ext = path.extname(name).slice(1).toUpperCase() || label;
          const note = system === "karaoke"
            ? "This computer / karaoke / MP3 pair required"
            : system === "music"
              ? "This computer / music"
              : `This computer / ${folder}`;
          const kind = (system === "ps3" && path.extname(name).toLowerCase() === ".ps3") ||
            (["ps4", "xbox360", "ports", "pygame", "windows"].includes(system) && fs.statSync(path.join(folderPath, name)).isDirectory())
            ? "folder"
            : "file";
          return [name, note, entry.type || ext, "OK", kind, null,
            entry.discSet?.title || (system === "mame" ? displayGameTitle(system, name) : null),
            null, null, entry.discSet || null];
        });

    return [system, { label, warehouse, active: [] }];
  }));
}

// Building the local library walks every console folder and can approach a
// megabyte of JSON. The UI polls for changes, so never repeat that synchronous
// disk walk for every poll. A short TTL still notices files added outside RP1
// quickly while keeping startup and the event loop responsive during transfers.
let localLibraryCache = { at: 0, value: null };
function cachedLocalLibrary({ fresh = false } = {}) {
  if (!fresh && localLibraryCache.value && Date.now() - localLibraryCache.at < 10000) {
    return localLibraryCache.value;
  }
  const value = listLocalLibrary();
  localLibraryCache = { at: Date.now(), value };
  return value;
}

function listLocalLibrarySizes(system) {
  const library = cachedLocalLibrary()[system];
  if (!library) throw new Error("Unknown system.");
  const sizes = {};
  const trackSizes = {};
  for (const item of library.warehouse) {
    if (system === "music" && item[4] === "folder") {
      let total = 0;
      const perTrack = {};
      for (const track of item[5] || []) {
        const relativeName = `${item[0]}/${track}`;
        try {
          const bytes = Number(fs.statSync(path.join(root, localFolders.music, relativeName)).size);
          perTrack[track] = bytes;
          total += bytes;
        } catch {}
      }
      sizes[item[0]] = total;
      trackSizes[item[0]] = perTrack;
      continue;
    }
    try { sizes[item[0]] = localTransferSize(system, item[0]).totalBytes; } catch {}
  }
  return { sizes, trackSizes };
}

const librarySizeResultCache = new Map();
const librarySizeJobs = new Map();
async function listLocalLibrarySizesAsync(system) {
  const cached = librarySizeResultCache.get(system);
  if (cached && Date.now() - cached.at < 30000) return cached.value;
  if (librarySizeJobs.has(system)) return librarySizeJobs.get(system);
  const library = cachedLocalLibrary()[system];
  if (!library) throw new Error("Unknown system.");
  const job = new Promise((resolve, reject) => {
    const worker = new Worker(path.join(uiRoot, "library-size-worker.js"), {
      workerData: {
        system,
        folderPath: path.join(root, localFolders[system]),
        items: library.warehouse.map(item => ({ name: item[0], kind: item[4] || "file", tracks: item[5] || [] }))
      }
    });
    worker.once("message", value => resolve(value));
    worker.once("error", reject);
    worker.once("exit", code => {
      if (code !== 0) reject(new Error(`Size worker stopped with code ${code}.`));
    });
  }).then(value => {
    librarySizeResultCache.set(system, { at: Date.now(), value });
    return value;
  }).finally(() => librarySizeJobs.delete(system));
  librarySizeJobs.set(system, job);
  return job;
}

function karaokePairName(fileName) {
  if (path.extname(fileName).toLowerCase() !== ".cdg") {
    throw new Error("Karaoke transfers must start from a .cdg file.");
  }

  return `${path.basename(fileName, path.extname(fileName))}.mp3`;
}

function xmlEscape(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mkdirpSftp(sftp, remoteDir) {
  // ROM directories already exist for installed systems. One stat avoids a
  // series of failed mkdir round trips on every upload.
  return statSftpOptional(sftp, remoteDir).then(stats => {
    if (stats?.isDirectory()) return;
    if (stats) throw new Error(`${remoteDir} exists but is not a directory.`);
    return mkdirpSftpMissing(sftp, remoteDir);
  });
}

function mkdirpSftpMissing(sftp, remoteDir) {
  const parts = remoteDir.split("/").filter(Boolean);
  let current = "";
  return parts.reduce((promise, part) => {
    return promise.then(() => new Promise(resolve => {
      current += `/${part}`;
      sftp.mkdir(current, () => resolve());
    }));
  }, Promise.resolve());
}

function refreshKaraokeGamelist(sftp, remoteDir) {
  return new Promise((resolve, reject) => {
    sftp.readdir(remoteDir, async (error, entries) => {
      if (error) {
        reject(error);
        return;
      }

      const games = entries
        .filter(entry => !entry.longname || !entry.longname.startsWith("d"))
        .map(entry => entry.filename)
        .filter(name => path.extname(name).toLowerCase() === ".cdg")
        .sort((a, b) => a.localeCompare(b))
        .map(name => {
          const label = path.basename(name, path.extname(name));
          return `  <game>\n    <path>./${xmlEscape(name)}</path>\n    <name>${xmlEscape(label)}</name>\n    <image>./media/images/karaoke.svg</image>\n    <marquee>./media/images/karaoke.svg</marquee>\n  </game>`;
        })
        .join("\n");
      const xml = `<?xml version="1.0"?>\n<gameList>\n${games ? `${games}\n` : ""}</gameList>\n`;
      sftp.writeFile(`${remoteDir}/gamelist.xml`, xml, writeError => writeError ? reject(writeError) : resolve());
    });
  });
}

async function resolveLakkaRomDir(device, system) {
  const folder = systemFolders[system];
  if (!folder) throw new Error(`Unknown system: ${system}`);
  const command = `for root in /storage/roms /storage/roms/*/RetroBat/roms /storage/roms/*/retrobat/roms /storage/roms/*/roms; do [ -d "$root/${folder}" ] && { printf '%s\\n' "$root/${folder}"; break; }; done`;
  const found = String(await execSsh(device, command, 15000)).trim().split(/\r?\n/)[0];
  return found || `/storage/roms/${folder}`;
}

async function listLakkaSystems(device) {
  const roots=device.platform==='recalbox'?'/recalbox/share/roms':'/storage/roms /storage/roms/*/RetroBat/roms /storage/roms/*/retrobat/roms /storage/roms/*/roms';
  const command = `for root in ${roots}; do [ -d "$root" ] || continue; for d in "$root"/*; do [ -d "$d" ] || continue; first=$(find "$d" -maxdepth 1 -type f ! -name 'gamelist.xml' ! -name '_info.txt' ! -name 'theme.xml' ! -name 'theme.xml.*' 2>/dev/null | head -n 1); [ -n "$first" ] && basename "$d"; done; done`;
  const folders = new Set(String(await execSsh(device, command, 30000)).split(/\r?\n/).map(value => value.trim()).filter(Boolean));
  return Object.entries(systemFolders).filter(([, folder]) => folders.has(folder)).map(([system]) => system);
}

function isLibraryMetadataName(name) {
  const lower = String(name || '').toLowerCase();
  const base = path.posix.basename(lower.replace(/\\/g, '/'));
  return !base || base.startsWith('.') || base.endsWith('.bw-part') ||
    ['gamelist.xml', '_info.txt', 'theme.xml', 'desktop.ini', 'thumbs.db'].includes(base) ||
    base.startsWith('theme.xml.') || /^readme(?:\.|$)/.test(base) ||
    ['.xml', '.txt', '.nfo', '.cfg', '.ini', '.log', '.md'].includes(path.extname(base));
}

async function listRemoteRoms(device, system) {
  if (device.access === "usb") {
    return listRemoteRomsUsb(device, system);
  }
  if (device.access === "smb") {
    return listRemoteRomsSmb(device, system);
  }

  const remoteDir = device.platform === 'lakka' ? await resolveLakkaRomDir(device, system) : remoteDirFor(system,device);
  return sftpWithDevice(device, sftp => new Promise((resolve, reject) => {
    if (system === "music") {
      listRemoteMusicFiles(sftp, remoteDir)
        .then(items => resolve(musicFolderRows(items, remoteDir)))
        .catch(reject);
      return;
    }

    sftp.readdir(remoteDir, async (error, entries) => {
      if (error) {
        if (error.code === 2) resolve([]);
        else reject(error);
        return;
      }

      let verifiedEntries = entries;
      if (system === "ps3") {
        verifiedEntries = (await Promise.all(entries.map(async entry => {
          const isDirectory = Boolean(entry.longname?.startsWith("d"));
          if (!isDirectory) return entry;
          const gameRoot = `${remoteDir}/${entry.filename}`;
          const [eboot, param] = await Promise.all([
            statSftpOptional(sftp, `${gameRoot}/PS3_GAME/USRDIR/EBOOT.BIN`),
            statSftpOptional(sftp, `${gameRoot}/PS3_GAME/PARAM.SFO`)
          ]);
          return eboot && Number(eboot.size) > 0 && param && Number(param.size) > 0 ? entry : null;
        }))).filter(Boolean);
      }

      const allowedExtensions = new Set(localExtensions[system] || []);
      let remoteNames = verifiedEntries
        .filter(entry => {
          const isDirectory = Boolean(entry.longname?.startsWith("d"));
          if (isDirectory && ['images','media','videos','manuals','marquees','downloaded_images'].includes(entry.filename.toLowerCase())) return false;
          if (isDirectory && system === 'ports' && verifiedEntries.some(other => other.filename === `${entry.filename}.libretro`)) return false;
          if (isDirectory && system === 'ps4' && verifiedEntries.some(other => other.filename.toLowerCase() === `${entry.filename}.ps4`.toLowerCase())) return false;
          if(system==='windows'){
            const ext=path.extname(entry.filename).toLowerCase();
            return isDirectory?ext==='.pc':new Set(['.pc','.exe','.wsquashfs','.wtgz']).has(ext)&&Number(entry.attrs?.size||0)>0;
          }
          return system === "ps3"
            ? (!isDirectory || path.extname(entry.filename).toLowerCase() === ".ps3")
            : ["ps4", "xbox360", "ports", "pygame", "windows"].includes(system) ? true : !isDirectory;
        })
        .filter(entry => {
          if (isLibraryMetadataName(entry.filename)) return false;
          const isDirectory = Boolean(entry.longname?.startsWith("d"));
          if (isDirectory) return ["ps3", "ps4", "xbox360", "ports", "pygame", "windows"].includes(system);
          return allowedExtensions.size > 0 && allowedExtensions.has(path.extname(entry.filename).toLowerCase());
        })
        .filter(entry => {
          const isDirectory = Boolean(entry.longname?.startsWith("d"));
          if (isDirectory || !entry.attrs || typeof entry.attrs.size !== "number") return true;
          try {
            const localPath = safeLocalRomPath(system, entry.filename);
            return !fs.existsSync(localPath) || !fs.statSync(localPath).isFile()
              || fs.statSync(localPath).size === Number(entry.attrs.size);
          } catch {
            return true;
          }
        })
        .map(entry => entry.filename)
        .filter(name => !isLibraryMetadataName(name))
        .filter(name => {
          const ext = path.extname(name).toLowerCase();
          if (system === "karaoke") {
            return ext === ".cdg";
          }
          if (system === "music") {
            return ext === ".mp3" || ext === ".flac";
          }
          return true;
        })
        .sort((a, b) => a.localeCompare(b));
      remoteNames = hideMameSupportFiles(system, remoteNames);
      if (system === "ps1") remoteNames = collapsePs1Sidecars(remoteNames);
      const rows = collapseRemoteMultiDiscEntries(system, remoteNames)
        .map(entry => [entry.name, remoteDir, entry.type, null, null, null,
          entry.discSet?.title || (system === "mame" ? displayGameTitle(system, entry.name) : null),
          null, null, entry.discSet || null]);

      if (system !== 'windows') {
        resolve(rows);
        return;
      }

      sftp.readdir('/userdata/roms/windows_installers', (installerError, installerEntries = []) => {
        if (installerError && installerError.code !== 2) {
          reject(installerError);
          return;
        }
        const installers = installerEntries
          .filter(entry => !isLibraryMetadataName(entry.filename) && !entry.filename.endsWith('.bw-part'))
          .filter(entry => Boolean(entry.longname?.startsWith('d')) || Number(entry.attrs?.size || 0) > 0)
          .map(entry => [entry.filename, '/userdata/roms/windows_installers', 'INSTALLER']);
        const friendlyName = name => String(name)
          .replace(/^\d{6}-\d{6}_/, '')
          .replace(/\.(?:pc|wine|exe|msi|iso|wsquashfs|wtgz)$/i, '')
          .replace(/_/g, ' ')
          .trim();
        const identity = name => friendlyName(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
        const logicalGames = new Map();
        [...rows, ...installers].forEach(item => {
          const displayName = friendlyName(item[0]);
          const key = identity(displayName);
          if (!logicalGames.has(key)) logicalGames.set(key, [...item, undefined, undefined, undefined, displayName]);
        });
        resolve([...logicalGames.values()].sort((a, b) => a[6].localeCompare(b[6])));
      });
    });
  }));
}

function listRemoteRomsUsb(device, system) {
  const deletions = device.usbMode === 'staged' ? deletionState(device.driveRoot, systemFolders[system] || system) : null;
  const remoteDir = usbPathForSystem(device, system);
  const legacyDir = device.usbMode === "staged" && system !== "music"
    ? path.win32.join(device.driveRoot, "bw-import", systemFolders[system] || system)
    : remoteDir;
  const readableDirs = [...new Set([remoteDir, legacyDir])].filter(dir => fs.existsSync(dir));
  const manifestPath = path.win32.join(device.driveRoot, "bw-library.tsv");
  let manifestNames = [];
  const snapshot = device.usbMode === "staged" ? readUsbLibrary(device.driveRoot) : null;
  if (snapshot) {
    const manifestSystem = system === "music" ? "music" : systemFolders[system] || system;
    manifestNames = (snapshot.systems[manifestSystem] || [])
      .filter(entry => !isLibraryMetadataName(entry.name) && !['media', 'images', 'manuals', 'videos', 'downloaded_images'].includes(entry.name.toLowerCase()))
      .filter(entry => !entry.name.endsWith('.bw-part'))
      .filter(entry => entry.kind === 'file' || ['ps3', 'ps4', 'xbox360', 'ports', 'pygame'].includes(system))
      .map(entry => entry.name);
  } else if (device.usbMode === "staged" && fs.existsSync(manifestPath)) {
    try {
      const manifestSystem = system === "music" ? "music" : systemFolders[system];
      manifestNames = fs.readFileSync(manifestPath, "utf8").split(/\r?\n/).map(line => line.split("\t"))
        .filter(parts => parts.length >= 2 && parts[0] === manifestSystem)
        .map(parts => parts[1]);
    } catch {}
  }
  if (!readableDirs.length && !manifestNames.length) return [];
  if (system === "music") {
    const stagedNames = readableDirs.flatMap(dir => listLocalFilesRecursive(dir, new Set(localExtensions.music)));
    return musicFolderRows([...new Set([...manifestNames, ...stagedNames])].filter(name=>!deletions?.hides(name)), device.usbMode === "direct" ? remoteDir : `${device.drive} userdata`);
  }
  const allowedExtensions = new Set(localExtensions[system] || []);
  const stagedNames = readableDirs.flatMap(dir => fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() ||
      (system === "ps3" && entry.isDirectory() &&
        (device.usbMode === "staged" || entry.name.toLowerCase().endsWith(".ps3"))) ||
      (["ps4", "xbox360", "ports", "pygame", "windows"].includes(system) && entry.isDirectory()))
    .map(entry => entry.name));
  let names = [...new Set([...manifestNames, ...stagedNames])]
    .filter(name=>!deletions?.hides(name))
    .filter(name => !allowedExtensions.size || allowedExtensions.has(path.extname(name).toLowerCase()) ||
      (system === "ps3" && (device.usbMode === "staged" || name.toLowerCase().endsWith(".ps3"))) ||
      (["ps4", "ports", "pygame"].includes(system)) || (system === "xbox360" && !path.extname(name)));
  names = hideMameSupportFiles(system, names);
  if (system === "ps1") names = collapsePs1Sidecars(names);
  return collapseRemoteMultiDiscEntries(system, names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })))
    .map(entry => [entry.name, device.usbMode === "direct" ? remoteDir : `${device.drive} userdata`, entry.type,
      null, null, null, entry.discSet?.title || null, null, null, entry.discSet || null]);
}

function listRemoteRomsSmb(device, system) {
  const remoteDir = smbPathForSystem(device.host, system, device.platform);
  if(['lakka','retroarch'].includes(device.platform)){
    const library=device.platform==='lakka'?`\\\\${device.host}\\Roms`:`\\\\${device.host}\\RetroArch\\roms`;
    try{fs.readdirSync(library);}catch{throw new Error(`${device.displayName||device.name}: Enable file sharing and make the ${device.platform==='lakka'?'Roms':'RetroArch/roms'} folder accessible from this PC.`);}
  }
  if (device.platform === 'retrobat') {
    // Check the share separately: inaccessible libraries are not empty libraries.
    fs.readdirSync(path.win32.join(`\\\\${device.host}\\RetroBat`,'roms'));
  }
  if (!fs.existsSync(remoteDir)) {
    return [];
  }

  if (system === "music") {
    const allowedExtensions = new Set(localExtensions.music);
    return musicFolderRows(listLocalFilesRecursive(remoteDir, allowedExtensions), remoteDir);
  }

  const allowedExtensions = new Set(localExtensions[system] || []);
  let names = fs.readdirSync(remoteDir, { withFileTypes: true })
    .filter(entry => device.platform !== 'retrobat' ||
      (!['images','media','videos','manuals','marquees','downloaded_images'].includes(entry.name.toLowerCase()) &&
       !(system === 'ports' && entry.isDirectory() && fs.existsSync(path.win32.join(remoteDir,`${entry.name}.libretro`)))))
    .filter(entry => entry.isFile() ||
      (system === "ps3" && entry.isDirectory() && path.extname(entry.name).toLowerCase() === ".ps3") ||
      (["ps4", "xbox360", "ports", "pygame", "windows"].includes(system) && entry.isDirectory()))
    .map(entry => entry.name)
    .filter(name => !isLibraryMetadataName(name))
    .filter(name => {
      const ext = path.extname(name).toLowerCase();
      if (system === "karaoke") {
        return ext === ".cdg";
      }
      return !allowedExtensions.size || allowedExtensions.has(ext) || ["ps4", "ports", "pygame"].includes(system) || (system === "xbox360" && !ext);
    });
  names = hideMameSupportFiles(system, names);
  if (system === "ps1") names = collapsePs1Sidecars(names);
  return collapseRemoteMultiDiscEntries(system, names.sort((a, b) => a.localeCompare(b)))
    .map(entry => [entry.name, remoteDir, entry.type, null, null, null,
      entry.discSet?.title || (system === "mame" ? displayGameTitle(system, entry.name) : null),
      null, null, entry.discSet || null]);
}

async function getDeviceStorage(device) {
  if (device.access === "usb") {
    const totalKb = Number(device.size || 0) / 1024;
    const freeKb = Number(device.freeSpace || 0) / 1024;
    const physicalKb = Number(device.physicalSize || device.size || 0) / 1024;
    let userdata = null;
    if (device.usbMode === "staged") {
      try {
        const values = fs.readFileSync(path.win32.join(device.driveRoot, "bw-storage.tsv"), "utf8").trim().split(/\s+/).map(Number);
        if (values.length >= 2 && values.every(Number.isFinite)) userdata = { totalKb: values[0], freeKb: values[1] };
      } catch {}
      const storage = readUsbLibrary(device.driveRoot)?.storage;
      if (Number.isFinite(storage?.totalKb) && Number.isFinite(storage?.freeKb)) userdata = storage;
    }
    const display = device.usbMode === "staged"
      ? userdata
        ? `Userdata free: ${formatStorage(userdata.freeKb)} • Staging free: ${formatStorage(freeKb)}`
        : `USB: ${formatStorage(physicalKb)} total • Staging free: ${formatStorage(freeKb)}`
      : `Free: ${formatStorage(freeKb)} of ${formatStorage(totalKb)}`;
    return {
      totalKb, usedKb: totalKb - freeKb, freeKb,
      percent: totalKb ? `${Math.round(((totalKb - freeKb) / totalKb) * 100)}%` : "--",
      total: formatStorage(totalKb), used: formatStorage(totalKb - freeKb), free: formatStorage(freeKb),
      physicalTotal: formatStorage(physicalKb), userdata, display, mount: device.drive
    };
  }
  if (device.access === "smb") {
    return {
      totalKb: 0,
      usedKb: 0,
      freeKb: 0,
      percent: "--",
      total: "--",
      used: "--",
      free: "SMB",
      mount: device.platform==='retrobat'?`\\\\${device.host}\\RetroBat`:device.platform==='lakka'?`\\\\${device.host}\\Roms`:device.platform==='retroarch'?`\\\\${device.host}\\RetroArch\\roms`:smbShareRoot(device.host)
    };
  }

  try {
    const stats = await sftpWithDevice(device, sftp => new Promise((resolve, reject) => {
      const storageRoot=device.platform==='lakka'?'/storage':device.platform==='recalbox'?'/recalbox/share':'/userdata';
      sftp.ext_openssh_statvfs(storageRoot, (error, info) => error ? reject(error) : resolve(info));
    }));
    const blockSize = Number(stats.f_frsize || stats.f_bsize || 0);
    const totalKb = (blockSize * Number(stats.f_blocks || 0)) / 1024;
    const freeKb = (blockSize * Number(stats.f_bavail || 0)) / 1024;
    const usedKb = totalKb - ((blockSize * Number(stats.f_bfree || 0)) / 1024);
    return {
      totalKb, usedKb, freeKb,
      percent: totalKb ? `${Math.round((usedKb / totalKb) * 100)}%` : "--",
      total: formatStorage(totalKb), used: formatStorage(usedKb), free: formatStorage(freeKb), mount: device.platform==='lakka'?'/storage':device.platform==='recalbox'?'/recalbox/share':'/userdata'
    };
  } catch {}

  const command = device.platform==='lakka'?'df -Pk /storage':device.platform==='recalbox'?'df -Pk /recalbox/share':"df -Pk /userdata 2>/dev/null || df -Pk /userdata/roms 2>/dev/null || df -Pk / 2>/dev/null";
  const output = await execSsh(device, command, 8000);
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  const line = lines[lines.length - 1] || "";
  const parts = line.trim().split(/\s+/);
  if (parts.length < 5) {
    throw new Error("Could not read free space.");
  }

  const totalKb = Number(parts[1]);
  const usedKb = Number(parts[2]);
  const freeKb = Number(parts[3]);
  const percent = parts[4];
  return {
    totalKb,
    usedKb,
    freeKb,
    percent,
    total: formatStorage(totalKb),
    used: formatStorage(usedKb),
    free: formatStorage(freeKb),
    mount: parts.slice(5).join(" ") || "/userdata"
  };
}

async function getXbox360XeniaStatus(device) {
  if (device.access !== "ssh") return { installed: false, xenia: false, wine: false, bottle: false, storageReady: false };
  const command = [
    "wine=0; xenia=0; bottle=0; storage=0",
    "for candidate in /usr/wine/wine-proton/bin/wine64 /usr/wine/wine-proton/bin/wine /usr/wine/wine-tkg/lib/wine/x86_64-unix/wine64 /usr/wine/wine-tkg/lib/wine/x86_64-unix/wine /usr/wine/wine-tkg/bin/wine64 /usr/wine/proton/bin/wine64 /usr/wine/proton/bin/wine; do [ -x \"$candidate\" ] && wine=1; done",
    "find /usr/xenia /usr/xenia-canary /usr/xenia-edge -maxdepth 3 -type f -iname 'xenia*.exe' 2>/dev/null | grep -q . && xenia=1 || true",
    "[ -s /userdata/system/wine-bottles/xbox360/system.reg ] && bottle=1",
    "fstype=$(findmnt -n -o FSTYPE /userdata 2>/dev/null || true); case \"$fstype\" in ext2|ext3|ext4|btrfs|xfs|f2fs) storage=1;; *) grep -qs ' /userdata/system/wine-bottles/xbox360 ext4 ' /proc/mounts && storage=1 || true;; esac",
    "echo WINE=$wine,XENIA=$xenia,BOTTLE=$bottle,STORAGE=$storage,FSTYPE=$fstype"
  ].join("; ");
  // This is a readiness probe, not a transfer. A busy Batocera machine may
  // need longer than 20 seconds to traverse its Wine and Xenia directories.
  const output = (await execSsh(device, command, 60000)).trim();
  const wine = /WINE=1/.test(output);
  const xenia = /XENIA=1/.test(output);
  const bottle = /BOTTLE=1/.test(output);
  const storageReady = /STORAGE=1/.test(output);
  const fileSystem = output.match(/FSTYPE=([^,\r\n]*)/)?.[1] || "";
  // Xbox 360 availability means Batocera provides Xenia. RP1 must not create
  // or initialize a Wine prefix merely because the console was selected.
  return { installed: xenia && storageReady, xenia, wine, bottle, storageReady, fileSystem, managedByBatocera: true };
}

async function prepareXbox360RuntimeStorage(device) {
  if (device.access !== "ssh" || device.platform && device.platform !== "batocera") {
    throw new Error("Xbox 360 storage preparation requires an online Batocera machine with SSH access.");
  }
  const command = [
    "set -e",
    "prefix=/userdata/system/wine-bottles/xbox360",
    "fstype=$(findmnt -n -o FSTYPE /userdata 2>/dev/null || true)",
    "case \"$fstype\" in ext2|ext3|ext4|btrfs|xfs|f2fs) echo NATIVE:$fstype; exit 0;; esac",
    "if grep -qs \" $prefix ext4 \" /proc/mounts; then echo READY:$fstype; exit 0; fi",
    "helper=/userdata/system/ready-player-one/xenia-storage.sh",
    "[ -f \"$helper\" ] || { echo MISSING_RP2_BOOTSTRAP >&2; exit 22; }",
    "chmod 755 \"$helper\" 2>/dev/null || true",
    "/bin/bash \"$helper\" prepare",
    "grep -qs \" $prefix ext4 \" /proc/mounts || { echo STORAGE_MOUNT_FAILED >&2; exit 23; }",
    "echo PREPARED:$fstype"
  ].join("; ");
  try {
    const output = (await execSsh(device, command, 180000)).trim();
    return { prepared: /^(?:NATIVE|READY|PREPARED):/m.test(output), output };
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes("MISSING_RP2_BOOTSTRAP")) throw new Error("This shared-drive Batocera installation needs the current RP2 runtime preflight. Install the updated Ready Player Two in Windows and run Configure All once.");
    if (message.includes("STORAGE_MOUNT_FAILED")) throw new Error("Batocera could not mount the Linux-compatible Xbox 360 runtime container. No Wine console was installed.");
    throw error;
  }
}

async function openXbox360XeniaProfile(device) {
  if (device.access !== "ssh" || device.platform && device.platform !== "batocera") {
    throw new Error("Xenia profile setup requires an online Batocera machine with SSH access.");
  }
  const status = await getXbox360XeniaStatus(device);
  if (!status.xenia) throw new Error("Xenia is missing from this Batocera build. RP1 did not install Wine.");
  const command = [
    "set -e",
    "if pgrep -f '[x]enia.*(exe|edge)' >/dev/null 2>&1; then echo XENIA_RUNNING; exit 23; fi",
    "preferred=$(batocera-settings-get xbox360.emulator 2>/dev/null || true)",
    "case \"$preferred\" in xenia-canary) helper=batocera-config-xenia-canary;; xenia-edge) helper=batocera-config-xenia-edge;; *) helper=batocera-config-xenia;; esac",
    "command -v \"$helper\" >/dev/null 2>&1 || { for candidate in batocera-config-xenia batocera-config-xenia-canary batocera-config-xenia-edge; do command -v \"$candidate\" >/dev/null 2>&1 && { helper=$candidate; break; }; done; }",
    "command -v \"$helper\" >/dev/null 2>&1 || { echo MISSING_XENIA_CONFIG; exit 24; }",
    "export DISPLAY=${DISPLAY:-$(getLocalXDisplay)}",
    "nohup \"$helper\" >/userdata/system/logs/rp1-xenia-profile.log 2>&1 </dev/null &",
    "echo STARTED=$helper"
  ].join("; ");
  try {
    const output = (await execSsh(device, command, 30000)).trim();
    return { opened: /STARTED=/.test(output), helper: output.match(/STARTED=([^\s]+)/)?.[1] || "" };
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes("XENIA_RUNNING")) throw new Error("Exit the Xbox 360 game first, then open profile setup.");
    if (message.includes("MISSING_XENIA_CONFIG")) throw new Error("Batocera's Xenia configuration tool is missing.");
    throw error;
  }
}

async function getWindowsWineStatus(device) {
  if (device.access !== "ssh" || device.platform && device.platform !== "batocera") {
    return { installed: false, wine: false, folders: false, shortcuts: false, menu: false };
  }
  const output = await execSsh(device, [
    "wine=0; folders=0; shortcuts=0; menu=0",
    "command -v batocera-wine >/dev/null 2>&1 && wine=1 || true",
    "[ -d /userdata/roms/windows ] && [ -d /userdata/roms/windows_installers ] && folders=1 || true",
    "[ -x /userdata/system/ready-player-one/windows-shortcuts.sh ] && shortcuts=1 || true",
    "[ -x /userdata/system/ready-player-one/windows-menu-sync.sh ] && [ -x /userdata/system/ready-player-one/windows-menu-launch.sh ] && grep -Fq '/userdata/system/ready-player-one/windows-menu-launch.sh' /userdata/system/configs/emulationstation/es_systems.cfg 2>/dev/null && [ ! -e /userdata/system/scripts/rp1-windows-menu-launch.sh ] && [ ! -e /userdata/system/scripts/rp1-windows-menu-sync.sh ] && menu=1 || true",
    "echo WINE=$wine,FOLDERS=$folders,SHORTCUTS=$shortcuts,MENU=$menu"
  ].join("; "), 20000);
  const wine = /WINE=1/.test(output);
  const folders = /FOLDERS=1/.test(output);
  const shortcuts = /SHORTCUTS=1/.test(output);
  const menu = /MENU=1/.test(output);
  return { installed: wine && folders && shortcuts && menu, wine, folders, shortcuts, menu };
}

async function setupWindowsWine(device) {
  if (device.access !== "ssh" || device.platform && device.platform !== "batocera") {
    throw new Error("Windows (Wine) setup requires an online Batocera machine with SSH access.");
  }
  const shortcutHook = `#!/bin/bash
event="$1"
case "$event" in
  ""|gameStart|gameStop) ;;
  *) exit 0 ;;
esac
root=/userdata/roms/windows
changed=0
for game in "$root"/*.wine "$root"/*.pc; do
  [ -d "$game" ] || continue
  if grep -Eq '^[[:space:]]*CMD=' "$game/autorun.cmd" 2>/dev/null; then
    case "$game" in
      *.wine) mv "$game" "\${game%.wine}.pc"; changed=1 ;;
    esac
    continue
  fi
  if timeout 30 batocera-wine windows autorun "$game" . </dev/null >/tmp/rp1-windows-shortcuts.log 2>&1; then
    if grep -Eq '^[[:space:]]*CMD=' "$game/autorun.cmd" 2>/dev/null; then
      case "$game" in
        *.wine) mv "$game" "\${game%.wine}.pc" ;;
      esac
      changed=1
    fi
  fi
done
[ -x /userdata/system/ready-player-one/windows-menu-sync.sh ] && /userdata/system/ready-player-one/windows-menu-sync.sh
exit 0
`;
  const shortcutHookPayload = Buffer.from(shortcutHook, "utf8").toString("base64");
  const windowsMenuSync = `#!/bin/bash
menu=/userdata/roms/windows_menu
mkdir -p "$menu/Shortcut" "$menu/Installer"
cat > "$menu/gamelist.xml" <<'EOF'
<?xml version="1.0"?>
<gameList>
  <folder><path>./Shortcut</path><name>Shortcut</name><sortname>01 Shortcut</sortname></folder>
  <folder><path>./Installer</path><name>Installer</name><sortname>02 Installer</sortname></folder>
</gameList>
EOF
find "$menu/Shortcut" "$menu/Installer" -mindepth 1 -maxdepth 1 -type l -delete
for item in /userdata/roms/windows/*.pc /userdata/roms/windows/*.wsquashfs /userdata/roms/windows/*.wtgz; do
  [ -e "$item" ] || continue
  ln -s "$item" "$menu/Shortcut/$(basename "$item")"
done
for item in /userdata/roms/windows_installers/*; do
  [ -e "$item" ] || continue
  if [ -f "$item" ]; then
    case "\${item##*.}" in exe|EXE|msi|MSI|iso|ISO) ln -s "$item" "$menu/Installer/$(basename "$item")" ;; esac
    continue
  fi
  candidate="$(find "$item" -maxdepth 4 -type f \\( -iname '*.exe' -o -iname '*.msi' -o -iname '*.iso' \\) | head -n 1)"
  [ -n "$candidate" ] || continue
  ext=".\${candidate##*.}"
  ln -s "$candidate" "$menu/Installer/$(basename "$item")$ext"
done
`;
  const windowsMenuSyncPayload = Buffer.from(windowsMenuSync, "utf8").toString("base64");
  const windowsMenuLauncher = `#!/bin/bash
args=("$@")
rom=""
for ((i=0; i<\${#args[@]}; i++)); do
  if [ "\${args[$i]}" = "-rom" ] && [ $((i + 1)) -lt \${#args[@]} ]; then
    rom="\${args[$((i + 1))]}"
    args[$((i + 1))]="$(readlink -f "$rom")"
    break
  fi
done
[ -n "$rom" ] || exit 2
case "$rom" in */Installer/*) system=windows_installers ;; *) system=windows ;; esac
exec emulatorlauncher -system "$system" "\${args[@]}"
`;
  const windowsMenuLauncherPayload = Buffer.from(windowsMenuLauncher, "utf8").toString("base64");
  const windowsMenuSetup = `import copy, os, shutil, xml.etree.ElementTree as ET
source='/usr/share/emulationstation/es_systems.cfg'
target='/userdata/system/configs/emulationstation/es_systems.cfg'
os.makedirs(os.path.dirname(target), exist_ok=True)
if not os.path.exists(target):
    shutil.copy2(source, target)
tree=ET.parse(target)
root=tree.getroot()
changed=False
systems=root.findall('system')
windows=next((s for s in systems if (s.findtext('name') or '').strip() == 'windows'), None)
if windows is None:
    source_root=ET.parse(source).getroot()
    source_windows=next((s for s in source_root.findall('system') if (s.findtext('name') or '').strip() == 'windows'), None)
    if source_windows is not None:
        windows=copy.deepcopy(source_windows)
        root.append(windows)
        changed=True
if windows is not None:
    values={
        'fullname':'Windows',
        'path':'/userdata/roms/windows_menu',
        'extension':'.pc .exe .iso .msi .wsquashfs .wtgz',
        'command':'/userdata/system/ready-player-one/windows-menu-launch.sh %CONTROLLERSCONFIG% -rom %ROM% -gameinfoxml %GAMEINFOXML% -systemname %SYSTEMNAME%',
        'theme':'windows'
    }
    for tag, value in values.items():
        node=windows.find(tag)
        if node is None:
            node=ET.SubElement(windows, tag)
        if node.text != value:
            node.text=value
            changed=True
for system in list(root.findall('system')):
    if (system.findtext('name') or '').strip() in ('windows_shortcuts', 'windows_installers'):
        root.remove(system)
        changed=True
if changed:
    tree.write(target, encoding='UTF-8', xml_declaration=True)
settings_path='/userdata/system/configs/emulationstation/es_settings.cfg'
if os.path.exists(settings_path):
    settings_tree=ET.parse(settings_path)
    settings_root=settings_tree.getroot()
else:
    settings_root=ET.Element('config')
    settings_tree=ET.ElementTree(settings_root)
folder_mode=next((n for n in settings_root.findall('string') if n.get('name') == 'FolderViewMode'), None)
if folder_mode is None:
    folder_mode=ET.SubElement(settings_root, 'string', {'name':'FolderViewMode'})
folder_mode.set('value', 'always')
settings_tree.write(settings_path, encoding='UTF-8', xml_declaration=True)
`;
  const windowsMenuPayload = Buffer.from(windowsMenuSetup, "utf8").toString("base64");
  const output = await execSsh(device, [
    "set -e",
    "command -v batocera-wine >/dev/null 2>&1 || { echo MISSING_WINE; exit 20; }",
    "mkdir -p /userdata/roms/windows /userdata/roms/windows_installers",
    "mkdir -p /userdata/roms/windows_menu",
    "mkdir -p /userdata/system/wine/exe /userdata/system/wine/msi /userdata/system/wine/fonts /userdata/system/wine/regs",
    "mkdir -p /userdata/system/scripts /userdata/system/ready-player-one",
    "rm -f /userdata/system/scripts/rp1-windows-shortcuts.sh /userdata/system/scripts/rp1-windows-shortcuts.sh.disabled",
    `printf '%s' '${shortcutHookPayload}' | base64 -d > /userdata/system/ready-player-one/windows-shortcuts.sh`,
    "chmod 755 /userdata/system/ready-player-one/windows-shortcuts.sh",
    "[ ! -L /userdata/roms/windows_menu/Shortcut ] || rm -f /userdata/roms/windows_menu/Shortcut",
    "[ ! -L /userdata/roms/windows_menu/Installer ] || rm -f /userdata/roms/windows_menu/Installer",
    "mkdir -p /userdata/roms/windows_menu/Shortcut /userdata/roms/windows_menu/Installer",
    "rm -f /userdata/system/scripts/rp1-windows-menu-sync.sh /userdata/system/scripts/rp1-windows-menu-launch.sh",
    `printf '%s' '${windowsMenuSyncPayload}' | base64 -d > /userdata/system/ready-player-one/windows-menu-sync.sh`,
    `printf '%s' '${windowsMenuLauncherPayload}' | base64 -d > /userdata/system/ready-player-one/windows-menu-launch.sh`,
    "chmod 755 /userdata/system/ready-player-one/windows-menu-sync.sh /userdata/system/ready-player-one/windows-menu-launch.sh",
    "/userdata/system/ready-player-one/windows-menu-sync.sh",
    `printf '%s' '${windowsMenuPayload}' | base64 -d | python3`,
    "test -d /userdata/roms/windows -a -d /userdata/roms/windows_installers",
    "echo WINDOWS_WINE_READY"
  ].join("; "), 30000);
  if (/MISSING_WINE/.test(output)) throw new Error("Batocera's Wine runner is missing. Update this x86-64 Batocera installation before adding Windows games.");
  const status = await getWindowsWineStatus(device);
  if (!status.installed) throw new Error("Windows (Wine) files were created, but launcher verification failed.");
  return { ...status, installers: "/userdata/roms/windows_installers", games: "/userdata/roms/windows" };
}

function formatStorage(kb) {
  if (!Number.isFinite(kb)) {
    return "--";
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = kb;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const precision = value >= 10 || unit === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unit]}`;
}

async function listRemoteMusicFiles(sftp, remoteDir, relativeDir = "") {
  const currentDir = relativeDir ? `${remoteDir}/${relativeDir}` : remoteDir;
  const entries = await new Promise((resolve, reject) => {
    sftp.readdir(currentDir, (error, list) => error ? reject(error) : resolve(list));
  });

  const files = [];
  for (const entry of entries) {
    const name = relativeDir ? `${relativeDir}/${entry.filename}` : entry.filename;
    const isDirectory = entry.longname && entry.longname.startsWith("d");
    if (isDirectory) {
      files.push(...await listRemoteMusicFiles(sftp, remoteDir, name));
      continue;
    }

    const ext = path.extname(entry.filename).toLowerCase();
    if (ext === ".mp3" || ext === ".flac") {
      files.push(name);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function windowsTransferTarget(localPath, fileName) {
  const stat=fs.statSync(localPath);
  const extension=path.extname(fileName).toLowerCase();
  if(!stat.isDirectory()){
    const installer=['.exe','.msi','.iso'].includes(extension);
    return {remoteDir:installer?'/userdata/roms/windows_installers':'/userdata/roms/windows',remoteName:fileName,installer};
  }
  const files=listLocalFilesRecursive(localPath,new Set(),localPath);
  const hasAutorun=files.some(name=>path.posix.basename(name).toLowerCase()==='autorun.cmd');
  const installer=files.some(name=>['.exe','.msi','.iso'].includes(path.extname(name).toLowerCase()))&&!hasAutorun;
  if(!hasAutorun&&!installer)throw new Error(`${fileName} is neither a Windows installer nor a Batocera .pc/.wine game folder.`);
  const remoteName=hasAutorun&&!['.pc','.wine'].includes(extension)?`${fileName}.pc`:fileName;
  return {remoteDir:installer?'/userdata/roms/windows_installers':'/userdata/roms/windows',remoteName,installer};
}

const threeDSenProfileIds = {
  "2d mode": 47, "adventure island": 69, "adventures of lolo": 60,
  "adventures of lolo 2": 66, "adventures of lolo 3": 67, "antarctic adventure": 61,
  "arkanoid": 1, "balloon fight": 2, "batman": 3, "battle city": 5,
  "battle kid": 4, "blaster master": 85, "binary land": 90, "bomberman": 6,
  "bubble bobble": 43, "burger time": 82, "burgertime": 82, "castlevania": 7,
  "castlevania ii simons quest": 74, "chip dale rescue rangers": 58,
  "chip and dale rescue rangers": 58, "circus charlie": 8, "city connection": 48,
  "clu clu land": 62, "contra": 9, "depths": 72, "dig dug": 10, "digdug": 10,
  "donkey kong": 11, "donkey kong 3": 12, "donkey kong jr": 13, "dr mario": 14,
  "dragon quest": 78, "dragon warrior": 78, "dragon quest ii": 79,
  "dragon warrior ii": 79, "dragon quest iii": 99, "dragon warrior iii": 99,
  "duck hunt": 15, "duck tales": 59, "ducktales": 59, "duck tales 2": 68,
  "ducktales 2": 68, "elevator action": 16, "excitebike": 17, "felix the cat": 80,
  "final fantasy": 77, "fire n ice": 76, "flappy bird": 52, "flappy bird fpv": 53,
  "flappy": 97, "flipull": 91, "galaga": 18, "ghosts n goblins": 65,
  "ghosts and goblins": 65, "goonies": 56, "gradius": 81, "gyromite": 19,
  "hogans alley": 20, "ice climber": 21, "jackal": 101,
  "jackie chans action kung fu": 71, "journey to silius": 22, "kung fu": 24,
  "kungfu": 24, "spartan x": 24, "legacy of the wizard": 25, "legend of kage": 26,
  "legend of zelda": 45, "the legend of zelda": 45, "life force": 83,
  "lode runner": 27, "lunar pool": 88, "mappy": 28, "mario bros": 29,
  "mega man": 30, "mega man 1": 30, "mega man 2": 31, "mega man 3": 64,
  "metroid": 32, "micro mages": 49, "mike tysons punch out": 87,
  "mike tyson punch out": 87, "moai kun": 89, "ninja gaiden iii": 84,
  "nuts milk": 92, "pac man": 33, "pacman": 33, "palamedes": 95, "pinball": 51,
  "pooyan": 57, "popeye": 34, "puzznic": 94, "quarth": 93, "road fighter": 35,
  "shadow of the ninja": 23, "shadow of ninja": 23, "kage": 23, "shatterhand": 54,
  "snow brothers": 70, "solomons key": 75, "spy hunter": 63, "super bat puncher": 36,
  "super mario bros": 37, "super mario bros 3": 55, "super spike vball": 86,
  "tetris": 38, "tetris nintendo": 38, "tetris tengen": 39, "tetris famicom": 98,
  "tiny toon adventures": 100, "twinbee": 50, "urban champion": 40,
  "wild gunman": 44, "wild gun man": 44, "wrecking crew": 41, "yie ar kung fu": 42,
  "yoshi": 96, "zelda ii the adventure of link": 73, "zooming secretary": 46
};

async function ensure3dSenSystem(device) {
  if (device.access !== "ssh" || device.platform && device.platform !== "batocera") {
    throw new Error("3dSen requires an online Batocera machine with SSH access.");
  }
  const setup = `import os, shutil, xml.etree.ElementTree as ET
source='/usr/share/emulationstation/es_systems.cfg'
target='/userdata/system/configs/emulationstation/es_systems.cfg'
os.makedirs(os.path.dirname(target),exist_ok=True)
if not os.path.exists(target): shutil.copy2(source,target)
tree=ET.parse(target); root=tree.getroot()
system=next((s for s in root.findall('system') if (s.findtext('name') or '').strip()=='3dsen'),None)
if system is None: system=ET.SubElement(root,'system')
values={'fullname':'3D NEC','name':'3dsen','manufacturer':'Geod Studio','release':'2020','hardware':'computer','path':'/userdata/roms/3dsen','extension':'.nes .zip .7z','command':'/userdata/system/ready-player-one/3dsen-launch.sh %ROM%','platform':'nes','theme':'3dsen'}
for tag,value in values.items():
 node=system.find(tag)
 if node is None: node=ET.SubElement(system,tag)
 node.text=value
tree.write(target,encoding='UTF-8',xml_declaration=True)
roms='/userdata/roms/3dsen'
if os.path.lexists(roms) and not os.path.islink(roms):
 raise RuntimeError('/userdata/roms/3dsen exists and is not an RP1 mirror')
if not os.path.lexists(roms): os.symlink('/userdata/roms/nes',roms)
`;
  const profileMapPayload = Buffer.from(JSON.stringify(threeDSenProfileIds), "utf8").toString("base64");
  const launcher = `#!/bin/bash
app=/userdata/system/ready-player-one/3dsen-runtime/3dSen.pc
if [ ! -f "$app/autorun.cmd" ]; then
  command -v batocera-notification >/dev/null 2>&1 && batocera-notification "3D NEC is not installed. Add the purchased Windows ZIP through Ready Player One."
  exit 20
fi
pkill -f '^3dSen.exe( |$)' 2>/dev/null || true
pkill -f 'UnityCrashHandler32.exe.*3dSen' 2>/dev/null || true
sleep 1
rom="$1"
if [ -z "$rom" ] || [ ! -f "$rom" ]; then
  command -v batocera-notification >/dev/null 2>&1 && batocera-notification "3D NEC could not find the selected NES game."
  exit 21
fi
config_dir=/userdata/system/wine-bottles/windows/wine-tkg/3dSen.pc.wine/drive_c/users/root/AppData/LocalLow/Geod\\ Studio/3dSen
mkdir -p "$config_dir"
profile_id="$(python3 - "$rom" "$config_dir/rom.json" "$app/autorun.cmd" <<'PY'
import base64, json, os, re, sys, time
rom, config_path, autorun_path = sys.argv[1:]
profiles = json.loads(base64.b64decode('${profileMapPayload}').decode('utf-8'))
title = os.path.splitext(os.path.basename(rom))[0]
clean = re.sub(r'\\([^)]*\\)|\\[[^]]*\\]', ' ', title)
clean = clean.replace('&', ' and ')
clean = clean.replace("'", '').replace('’', '')
clean = re.sub(r'[^a-z0-9]+', ' ', clean.lower()).strip()
profile_id = profiles.get(clean)
if profile_id is None:
    aliases = sorted(profiles, key=len, reverse=True)
    profile_id = next((profiles[key] for key in aliases if clean == key or clean.startswith(key + ' ') or clean.endswith(' ' + key)), 47)
wine_path = 'Z:' + rom.replace('/', '\\\\')
try:
    with open(config_path, 'r', encoding='utf-8-sig') as source:
        document = json.load(source)
except Exception:
    document = {'Items': []}
items = document.get('Items')
if not isinstance(items, list):
    items = []
entry = next((item for item in items if str(item.get('id', '')) == str(profile_id)), None)
if entry is None:
    entry = {'id': str(profile_id)}
    items.append(entry)
entry.update({'id': str(profile_id), 'romPath': wine_path, 'title': title, 'lastTime': int(time.time())})
document['Items'] = items
temporary = config_path + '.tmp'
with open(temporary, 'w', encoding='utf-8', newline='\\n') as output:
    json.dump(document, output, ensure_ascii=False, indent=2)
os.replace(temporary, config_path)
with open(autorun_path, 'w', encoding='utf-8', newline='\\n') as output:
    output.write('CMD="3dSen.exe" -screen-fullscreen 1 -screen-width 1920 -screen-height 1080 -id=' + str(profile_id) + '\\n')
print(profile_id)
PY
)"
if [ -z "$profile_id" ]; then
  command -v batocera-notification >/dev/null 2>&1 && batocera-notification "3D NEC could not prepare the selected game."
  exit 22
fi
exec batocera-wine windows play "$app"
`;
  const setupPayload = Buffer.from(setup, "utf8").toString("base64");
  const launcherPayload = Buffer.from(launcher, "utf8").toString("base64");
  await execSsh(device, [
    "set -e",
    "mkdir -p /userdata/roms/nes /userdata/system/ready-player-one",
    `printf '%s' '${setupPayload}' | base64 -d | python3`,
    `printf '%s' '${launcherPayload}' | base64 -d > /userdata/system/ready-player-one/3dsen-launch.sh`,
    "chmod 755 /userdata/system/ready-player-one/3dsen-launch.sh",
    "test -L /userdata/roms/3dsen",
    "grep -Fq '<name>3dsen</name>' /userdata/system/configs/emulationstation/es_systems.cfg"
  ].join("; "), 30000);
}

function find3dSenWindowsArchive() {
  const folders = [path.join(root, "installers", "3dsen"), path.join(os.homedir(), "Downloads")];
  const candidates = folders.flatMap(folder => {
    if (!fs.existsSync(folder)) return [];
    return fs.readdirSync(folder, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^3dsenpc-win(?:\s*\(\d+\))?\.zip$/i.test(entry.name))
      .map(entry => path.join(folder, entry.name));
  });
  return candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0] || "";
}

async function install3dSenWineRuntime(device) {
  if (device.access !== "ssh" || device.platform && device.platform !== "batocera") {
    throw new Error("Automatic 3dSen Wine installation requires an online Batocera machine with SSH access.");
  }
  const architecture = (await execSsh(device, "uname -m", 15000)).trim();
  if (architecture !== "x86_64") {
    throw new Error(`3D NEC requires an x86_64 Batocera machine; this machine reports ${architecture || "an unknown architecture"}.`);
  }
  const archive = find3dSenWindowsArchive();
  if (!archive) throw new Error("The bundled 3dSen installer is missing. Put the purchased file at Ready Player One\\installers\\3dsen\\3dsenpc-win.zip, then apply 3D NEC again.");
  const remoteRoot = "/userdata/system/ready-player-one";
  const remoteArchive = `${remoteRoot}/3dsenpc-win.zip.upload`;
  const runtime = `${remoteRoot}/3dsen-runtime/3dSen.pc`;
  const extractor = `import os, shutil, zipfile
archive=${JSON.stringify(remoteArchive)}
destination=${JSON.stringify(runtime)}
if os.path.exists(destination): shutil.rmtree(destination)
os.makedirs(destination,exist_ok=True)
with zipfile.ZipFile(archive) as bundle:
 for item in bundle.infolist():
  target=os.path.abspath(os.path.join(destination,item.filename))
  if os.path.commonpath([os.path.abspath(destination),target]) != os.path.abspath(destination): raise RuntimeError('Unsafe path in 3dSen archive')
 bundle.extractall(destination)
executables=[]
for base,dirs,files in os.walk(destination):
 for name in files:
  lower=name.lower()
  if lower.endswith('.exe') and 'crashhandler' not in lower and 'uninstall' not in lower: executables.append(os.path.join(base,name))
if not executables: raise RuntimeError('The archive does not contain the 3dSen Windows executable')
executables.sort(key=lambda value:(0 if '3dsen' in os.path.basename(value).lower() else 1,len(value),value.lower()))
relative=os.path.relpath(executables[0],destination).replace('\\\\','/')
folder=os.path.dirname(relative)
name=os.path.basename(relative).replace('"','\\"')
lines=[]
if folder: lines.append('DIR='+folder)
lines.append('CMD="'+name+'" -screen-fullscreen 1 -screen-width 1920 -screen-height 1080')
with open(os.path.join(destination,'autorun.cmd'),'w',newline='\\n') as output: output.write('\\n'.join(lines)+'\\n')
`;
  const payload = Buffer.from(extractor, "utf8").toString("base64");
  await sftpWithDevice(device, async (sftp, client) => {
    await execOnSshClient(client, `mkdir -p ${remoteRoot}`);
    await fastPutSftp(sftp, archive, remoteArchive);
    await execOnSshClient(client, ["set -e", "command -v batocera-wine >/dev/null 2>&1",
      `printf '%s' '${payload}' | base64 -d | python3`, `rm -f ${remoteArchive}`,
      `test -s ${runtime}/autorun.cmd`, "sync"].join("; "), 180000);
  });
  return { installed: true, source: path.basename(archive), runtime };
}

async function uploadRom(device, system, fileName, progress = null, registerCancel = null) {
  if (isExcludedLibraryGame(system, fileName)) throw new Error("2048 is excluded from RP1's NES library and will not be installed.");
  if (system === 'ps2') await medicinePs2Bios.ensure(device, progress);
  if (device.access === "usb") {
    return uploadRomUsb(device, system, fileName, progress);
  }
  if (device.access === "smb") {
    return uploadRomSmb(device, system, fileName);
  }
  if (system === "3dsen") await ensure3dSenSystem(device);

  // Uploads get their own SFTP connection so a large ISO cannot block the
  // cached browsing channel used by storage and installed-library reads.
  const uploaded = await sftpWithDedicatedDevice(device, async (sftp, client) => {
    const localPath = safeLocalRomPath(system, fileName);
    const windowsTarget=system==='windows'?windowsTransferTarget(localPath,fileName):null;
    const remoteDir = windowsTarget?.remoteDir||remoteDirFor(system,device);
    const remoteName = windowsTarget?.remoteName||fileName;
    const remotePath = `${remoteDir}/${remoteName}`;
    await mkdirpSftp(sftp, remoteDir);
    if (["ps3", "ps4", "xbox360", "ports", "pygame", "windows"].includes(system) && fs.statSync(localPath).isDirectory()) {
      const existingTarget=await statSftpOptional(sftp,remotePath);
      if(existingTarget&&!existingTarget.isDirectory())await new Promise((resolve,reject)=>sftp.unlink(remotePath,error=>error?reject(error):resolve()));
      const files = listLocalFilesRecursive(localPath, new Set(), localPath);
      const totalBytes = files.reduce((sum, relativeFile) => sum + fs.statSync(path.join(localPath, relativeFile)).size, 0);
      let completedBytes = 0;
      let skippedFiles = 0;
      progress?.({ totalFiles: files.length, completedFiles: 0, totalBytes, transferredBytes: 0, skippedFiles, current: "Checking existing files" });
      for (let index = 0; index < files.length; index += 1) {
        const relativeFile = files[index];
        const localFile = path.join(localPath, relativeFile);
        const remoteFile = `${remotePath}/${relativeFile.replace(/\\/g, "/")}`;
        await mkdirpSftp(sftp, path.posix.dirname(remoteFile));
        const fileSize = fs.statSync(localFile).size;
        const result = await resumablePutSftp(sftp, localFile, remoteFile, sent => {
          progress?.({ totalFiles: files.length, completedFiles: index, totalBytes, transferredBytes: completedBytes + sent, skippedFiles, current: relativeFile });
        }, client);
        const remoteStats = await statSftpOptional(sftp, remoteFile);
        if (!remoteStats || Number(remoteStats.size) !== fileSize) {
          throw new Error(`Transfer verification failed for ${relativeFile}.`);
        }
        if (result.skipped) skippedFiles += 1;
        completedBytes += fileSize;
        progress?.({ totalFiles: files.length, completedFiles: index + 1, totalBytes, transferredBytes: completedBytes, skippedFiles, current: relativeFile });
      }
      return [remoteName, remotePath, `${files.length} files${windowsTarget?.installer?' • installer':''}`, "OK", "folder"];
    }
    if (system === "music") {
      const localFolder = path.join(root, localFolders.music, fileName);
      const allowedExtensions = new Set(localExtensions.music);
      if (fs.existsSync(localFolder) && fs.statSync(localFolder).isDirectory()) {
        const files = listLocalFilesRecursive(localFolder, allowedExtensions, localFolder);
        for (const relativeFile of files) {
          const localFile = path.join(localFolder, relativeFile);
          const remoteFile = `${remoteDir}/${fileName}/${relativeFile}`;
          await mkdirpSftp(sftp, path.posix.dirname(remoteFile));
          await fastPutSftp(sftp, localFile, remoteFile);
        }
        return [fileName, `${remoteDir}/${fileName}`, `${files.length} track${files.length === 1 ? "" : "s"}`, "OK", "folder"];
      }
    }

    if (system === "music" && fileName.includes("/")) {
      await mkdirpSftp(sftp, path.posix.dirname(remotePath));
    }
    const transferFiles = uploadTransferFiles(system, fileName);
    if (transferFiles.length > 1) {
      const totalBytes = transferFiles.reduce((sum, item) => sum + fs.statSync(item.localPath).size, 0);
      let completedBytes = 0;
      let skippedFiles = 0;
      progress?.({ totalFiles: transferFiles.length, completedFiles: 0, totalBytes, transferredBytes: 0, skippedFiles, current: "Checking existing files" });
      for (let index = 0; index < transferFiles.length; index += 1) {
        const item = transferFiles[index];
        const destination = `${remoteDir}/${item.name.replace(/\\/g, "/")}`;
        const partial = `${destination}.bw-part`;
        const size = fs.statSync(item.localPath).size;
        await mkdirpSftp(sftp, path.posix.dirname(destination));
        const result = await resumablePutSftp(sftp, item.localPath, partial, sent => {
          progress?.({ totalFiles: transferFiles.length, completedFiles: index, totalBytes, transferredBytes: completedBytes + sent, skippedFiles, current: item.name });
        }, client);
        const completedStats = await statSftpOptional(sftp, partial);
        if (!completedStats || Number(completedStats.size) !== size) throw new Error(`Transfer verification failed for ${item.name}.`);
        await new Promise(resolve => sftp.unlink(destination, () => resolve()));
        await new Promise((resolve, reject) => sftp.rename(partial, destination, error => error ? reject(error) : resolve()));
        if (result.skipped) skippedFiles += 1;
        completedBytes += size;
        progress?.({ totalFiles: transferFiles.length, completedFiles: index + 1, totalBytes, transferredBytes: completedBytes, skippedFiles, current: item.name });
      }
      return [fileName, remoteDir, systemLabels[system] || system.toUpperCase()];
    }
    const fileSize = fs.statSync(localPath).size;
    progress?.({ totalFiles: 1, completedFiles: 0, totalBytes: fileSize, transferredBytes: 0, skippedFiles: 0, current: fileName });
    const partialPath = `${remotePath}.bw-part`;
    const finalStats = await statSftpOptional(sftp, remotePath);
    // A completed destination with the exact source size is already present.
    // Do not stage, overwrite, or retransmit it merely because an old queue
    // was restored or Upload All was selected again.
    if (finalStats && Number(finalStats.size) === fileSize) {
      progress?.({ totalFiles: 1, completedFiles: 1, totalBytes: fileSize, transferredBytes: fileSize, skippedFiles: 1, current: "" });
      return [fileName, system === "music" ? path.posix.dirname(remotePath) : remoteDir, system === "music" ? path.extname(fileName).slice(1).toUpperCase() : system.toUpperCase()];
    }
    const partialStats = await statSftpOptional(sftp, partialPath);
    if (finalStats && Number(finalStats.size) !== fileSize && !partialStats) {
      await new Promise((resolve, reject) => sftp.rename(remotePath, partialPath, error => error ? reject(error) : resolve()));
    }
    const upload = await resumablePutSftp(sftp, localPath, partialPath, sent => {
      progress?.({ totalFiles: 1, completedFiles: 0, totalBytes: fileSize, transferredBytes: sent, skippedFiles: 0, current: fileName });
    }, client);
    const completedStats = await statSftpOptional(sftp, partialPath);
    if (!completedStats || Number(completedStats.size) !== fileSize) throw new Error(`Transfer verification failed for ${fileName}.`);
    await new Promise(resolve => sftp.unlink(remotePath, () => resolve()));
    await new Promise((resolve, reject) => sftp.rename(partialPath, remotePath, error => error ? reject(error) : resolve()));
    progress?.({ totalFiles: 1, completedFiles: 1, totalBytes: fileSize, transferredBytes: fileSize, skippedFiles: upload.skipped ? 1 : 0, current: "" });

    if (system === "karaoke") {
      const pairName = karaokePairName(fileName);
      const pairLocalPath = safeLocalRomPath(system, pairName);
      await fastPutSftp(sftp, pairLocalPath, `${remoteDir}/${pairName}`);
      await refreshKaraokeGamelist(sftp, remoteDir);
    }

    return [fileName, system === "music" ? path.posix.dirname(remotePath) : remoteDir, system === "music" ? path.extname(fileName).slice(1).toUpperCase() : system.toUpperCase()];
  }, registerCancel);
  if (system === 'windows') {
    await execSsh(device, '[ ! -x /userdata/system/ready-player-one/windows-menu-sync.sh ] || /userdata/system/ready-player-one/windows-menu-sync.sh', 15000);
  }
  if (system === "mame" && device.access !== "usb" && device.access !== "smb") {
    await configureMameGameEmulator(device, fileName);
  }
  return uploaded;
}

// MAME ROM sets are tied to emulator generations. Never force one core on the
// entire system: Batocera supports an emulator/core override for each ROM. The
// RP1 library currently contains a MAME 0.224 set, whose .7z archives are far
// closer to current full MAME than the default 0.78-era mame078plus core.
// Keeping this as a per-game setting also lets a known legacy title be changed
// independently later without disturbing every other arcade game.
async function configureMameGameEmulator(device, fileName, preference = "current") {
  const cleanName = path.basename(String(fileName || "")).replace(/[=#]/g, "");
  if (!cleanName) return;
  const useLegacy = preference === "legacy";
  const emulator = useLegacy ? "libretro" : "mame";
  const core = useLegacy ? "mame078plus" : "mame";
  const prefix = `mame["${cleanName}"]`;
  await execSsh(device, [
    `batocera-settings-set ${shellSingleQuoted(`${prefix}.emulator`)} ${shellSingleQuoted(emulator)}`,
    `batocera-settings-set ${shellSingleQuoted(`${prefix}.core`)} ${shellSingleQuoted(core)}`
  ].join("; "), 15000);
}

function usbPathForSystem(device, system) {
  const base = device.usbMode === "direct" ? device.dataRoot : path.win32.join(device.driveRoot, "bw-import");
  if (system === "music") return path.win32.join(base, "music");
  const folder = systemFolders[system];
  if (!folder) throw new Error(`Unknown system: ${system}`);
  return path.win32.join(base, "roms", folder);
}

function installUsbImportScript(device) {
  if (device.usbMode === 'staged') stageController(device.driveRoot);
}

function usbLibraryReaderInstalled(device) {
  if (!device?.usb || device.usbMode !== "staged") return false;
  const scriptPath = path.win32.join(device.driveRoot, "postshare.sh");
  try {
    return /# (?:BATOCERA WAREHOUSE USB V2|READY PLAYER ONE USB BOOT V3 BEGIN)/.test(fs.readFileSync(scriptPath, "utf8"));
  } catch {
    return false;
  }
}

async function uploadRomUsb(device, system, fileName, progress = null) {
  const localPath = safeLocalRomPath(system, fileName);
  const destinationRoot = usbPathForSystem(device, system);
  const destination = path.win32.join(destinationRoot, fileName);
  const isDirectory = fs.statSync(localPath).isDirectory();
  const ps1Files = !isDirectory ? uploadTransferFiles(system, fileName) : [];
  const files = isDirectory ? listLocalFilesRecursive(localPath, new Set(), localPath) : ps1Files.map(item => item.name);
  const totalBytes = isDirectory
    ? files.reduce((sum, relativeFile) => sum + fs.statSync(path.join(localPath, relativeFile)).size, 0)
    : ps1Files.reduce((sum, item) => sum + fs.statSync(item.localPath).size, 0);
  const freeBytes = Number(device.freeSpace || 0);
  if (device.usbMode === "staged" && totalBytes > freeBytes) {
    throw new Error(`The Batocera boot partition has only ${(freeBytes / 1073741824).toFixed(1)} GB free. Windows cannot directly access its Linux userdata partition, so this transfer is too large to stage.`);
  }

  let completedBytes = 0;
  let skippedFiles = 0;
  let writtenBytes = 0;
  const copyStarted = performance.now();
  const bytesPerSecond = () => writtenBytes / Math.max((performance.now() - copyStarted) / 1000, 0.001);
  progress?.({ totalFiles: files.length, completedFiles: 0, totalBytes, transferredBytes: 0, bytesPerSecond: 0, skippedFiles, current: "Checking USB" });
  for (let index = 0; index < files.length; index += 1) {
    const relativeFile = files[index];
    const ps1Item = !isDirectory ? ps1Files[index] : null;
    const localFile = isDirectory ? path.join(localPath, relativeFile) : ps1Item.localPath;
    const remoteFile = isDirectory ? path.join(destination, relativeFile) : path.win32.join(destinationRoot, ps1Item.name);
    const size = fs.statSync(localFile).size;
    const result = await copyFileResumableLocal(localFile, remoteFile, (sent, skipped, newlyWritten) => {
      writtenBytes += newlyWritten;
      progress?.({ totalFiles: files.length, completedFiles: index, totalBytes, transferredBytes: completedBytes + sent, bytesPerSecond: bytesPerSecond(), skippedFiles, current: relativeFile || fileName });
    });
    if (result.skipped) skippedFiles += 1;
    completedBytes += size;
    progress?.({ totalFiles: files.length, completedFiles: index + 1, totalBytes, transferredBytes: completedBytes, bytesPerSecond: bytesPerSecond(), skippedFiles, current: relativeFile || fileName });
  }
  installUsbImportScript(device);
  if (device.usbMode === 'staged') cancelDeletion(device.driveRoot, systemFolders[system] || system, fileName);
  return [fileName, destinationRoot, isDirectory ? `${files.length} files` : system.toUpperCase(), "OK", isDirectory ? "folder" : "file"];
}

async function uploadRomSmb(device, system, fileName) {
  const localPath = safeLocalRomPath(system, fileName);
  const windowsTarget=system==='windows'?windowsTransferTarget(localPath,fileName):null;
  const remoteDir = windowsTarget?.installer
    ? path.win32.join(smbShareRoot(device.host),'roms','windows_installers')
    : smbPathForSystem(device.host, system, device.platform);
  const remoteName=windowsTarget?.remoteName||fileName;
  fs.mkdirSync(remoteDir, { recursive: true });

  if (["ps3", "ps4", "xbox360", "ports", "pygame", "windows"].includes(system) && fs.statSync(localPath).isDirectory()) {
    const target=path.win32.join(remoteDir,remoteName);
    if(fs.existsSync(target)&&!fs.statSync(target).isDirectory())fs.rmSync(target,{force:true});
    const files = listLocalFilesRecursive(localPath, new Set(), localPath);
    for (const relativeFile of files) {
      const localFile = path.join(localPath, relativeFile);
      const remoteFile = path.win32.join(remoteDir, remoteName, relativeFile);
      fs.mkdirSync(path.dirname(remoteFile), { recursive: true });
      fs.copyFileSync(localFile, remoteFile);
    }
    return [remoteName, target, `${files.length} files${windowsTarget?.installer?' • installer':''}`, "OK", "folder"];
  }

  if (system === "music") {
    const localFolder = path.join(root, localFolders.music, fileName);
    const allowedExtensions = new Set(localExtensions.music);
    if (fs.existsSync(localFolder) && fs.statSync(localFolder).isDirectory()) {
      const files = listLocalFilesRecursive(localFolder, allowedExtensions, localFolder);
      for (const relativeFile of files) {
        const localFile = path.join(localFolder, relativeFile);
        const remoteFile = path.win32.join(remoteDir, fileName, relativeFile);
        fs.mkdirSync(path.dirname(remoteFile), { recursive: true });
        fs.copyFileSync(localFile, remoteFile);
      }
      return [fileName, path.win32.join(remoteDir, fileName), `${files.length} track${files.length === 1 ? "" : "s"}`, "OK", "folder"];
    }
  }

  const remotePath = path.win32.join(remoteDir, remoteName);
  fs.mkdirSync(path.dirname(remotePath), { recursive: true });
  const ps1Files = uploadTransferFiles(system, fileName);
  for (const item of ps1Files) {
    const destination = path.win32.join(remoteDir, item.name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(item.localPath, destination);
  }

  if (system === "karaoke") {
    const pairName = karaokePairName(fileName);
    const pairLocalPath = safeLocalRomPath(system, pairName);
    fs.copyFileSync(pairLocalPath, path.win32.join(remoteDir, pairName));
  }

  return [fileName, system === "music" ? path.dirname(remotePath) : remoteDir, system === "music" ? path.extname(fileName).slice(1).toUpperCase() : system.toUpperCase()];
}

function removeRom(device, system, fileName) {
  const groupedFileNames = (() => {
    try { return ps1TransferFiles(system, fileName).map(item => item.name); }
    catch { return [fileName]; }
  })();
  if (device.access === "usb") {
    const base = usbPathForSystem(device, system);
    const target = path.win32.join(base, fileName);
    const relative = path.win32.relative(base, target);
    if (!relative || relative.startsWith("..") || path.win32.isAbsolute(relative)) throw new Error("Invalid USB ROM path.");
    if (device.usbMode === 'staged') {
      installUsbImportScript(device);
      const folder = systemFolders[system] || system;
      groupedFileNames.forEach(name => queueDeletion(device.driveRoot, folder, name));
      try {
        groupedFileNames.forEach(name => fs.rmSync(path.win32.join(base, name), {recursive:true,force:true}));
        if (system !== 'music') {
          const legacyBase = path.win32.join(device.driveRoot,'bw-import',folder);
          groupedFileNames.forEach(name => {
            const legacyTarget = path.win32.join(legacyBase,name);
            const legacyRelative = path.win32.relative(legacyBase,legacyTarget);
            if (!legacyRelative || legacyRelative.startsWith('..') || path.win32.isAbsolute(legacyRelative)) throw new Error('Invalid USB ROM path.');
            fs.rmSync(legacyTarget,{recursive:true,force:true});
          });
        }
      }
      catch (error) { groupedFileNames.forEach(name => cancelDeletion(device.driveRoot,folder,name)); throw error; }
      return {queued:true};
    }
    groupedFileNames.forEach(name => fs.rmSync(path.win32.join(base, name), { recursive: true, force: true }));
    return;
  }
  if (device.access === "smb") {
    return removeRomSmb(device, system, fileName);
  }

  return sftpWithDevice(device, async sftp => {
    const remoteDir = remoteDirFor(system,device);
    if (system === 'windows') {
      const installedPath = `${remoteDir}/${fileName}`;
      const installerPath = `/userdata/roms/windows_installers/${fileName}`;
      const installedStat = await statSftpOptional(sftp, installedPath);
      await removeRemotePath(sftp, installedStat ? installedPath : installerPath);
      return;
    }
    if (groupedFileNames.length === 1 && (["music", "ps4", "xbox360", "ports", "pygame"].includes(system) || (system === "ps3" && path.extname(fileName).toLowerCase() === ".ps3"))) {
      await removeRemotePath(sftp, `${remoteDir}/${fileName}`);
      return;
    }

    const fileNames = system === "karaoke" ? [fileName, karaokePairName(fileName)] : groupedFileNames;
    for (const name of fileNames) {
      await new Promise((resolve, reject) => {
        sftp.unlink(`${remoteDir}/${name}`, error => {
          if (error && error.code !== 2) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
    if (system === "karaoke") {
      await refreshKaraokeGamelist(sftp, remoteDir);
    }
  });
}

function removableGameNames(system, fileName) {
  try { return ps1TransferFiles(system, fileName).map(item => item.name); }
  catch { return [fileName]; }
}

function removePublishedArtworkLocal(root, system, fileName) {
  if (system === "music") return { entriesRemoved: 0, picturesRemoved: 0 };
  const gamelist = path.join(root, "gamelist.xml");
  if (!fs.existsSync(gamelist)) return { entriesRemoved: 0, picturesRemoved: 0 };
  const targets = new Set(removableGameNames(system, fileName).map(name => String(name).replace(/\\/g, "/").replace(/^\.\//, "")));
  let xml = fs.readFileSync(gamelist, "utf8");
  const media = new Set();
  let entriesRemoved = 0;
  xml = xml.replace(/<game\b[^>]*>[\s\S]*?<\/game>\s*/gi, block => {
    const gamePath = firstXmlTag(block, "path").replace(/\\/g, "/").replace(/^\.\//, "");
    const matched = [...targets].some(target => gamePath === target || gamePath.startsWith(`${target}/`));
    if (!matched) return block;
    for (const tag of ["image", "thumbnail", "marquee"]) {
      const value = firstXmlTag(block, tag);
      if (value) media.add(value);
    }
    entriesRemoved += 1;
    return "";
  });
  if (!entriesRemoved) return { entriesRemoved: 0, picturesRemoved: 0 };
  const temporary = `${gamelist}.rp1-remove-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temporary, xml, "utf8");
  fs.renameSync(temporary, gamelist);
  let picturesRemoved = 0;
  for (const relativeMedia of media) {
    if (["image", "thumbnail", "marquee"].some(tag => firstXmlTag(xml, tag) === relativeMedia) || xml.includes(`>${relativeMedia}<`)) continue;
    const cleaned = relativeMedia.replace(/\\/g, "/").replace(/^\.\//, "");
    const candidate = path.resolve(root, ...cleaned.split("/"));
    const relative = path.relative(path.resolve(root), candidate);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) continue;
    if (fs.existsSync(candidate)) { fs.rmSync(candidate, { force: true }); picturesRemoved += 1; }
  }
  return { entriesRemoved, picturesRemoved };
}

async function removePublishedArtworkUnlocked(device, system, fileName) {
  if (system === "music") return { entriesRemoved: 0, picturesRemoved: 0 };
  if (device.access === "usb") return removePublishedArtworkLocal(usbPathForSystem(device, system), system, fileName);
  if (device.access === "smb") return removePublishedArtworkLocal(smbPathForSystem(device.host, system, device.platform), system, fileName);
  const root = remoteDirFor(system, device);
  const targets = removableGameNames(system, fileName);
  const script = `import json,os,uuid,xml.etree.ElementTree as ET\nroot=${JSON.stringify(root)}\ntargets=set(x.replace('\\\\','/').lstrip('./') for x in json.loads(${JSON.stringify(JSON.stringify(targets))}))\ngamelist=os.path.join(root,'gamelist.xml')\nresult={'entriesRemoved':0,'picturesRemoved':0}\nif os.path.isfile(gamelist):\n tree=ET.parse(gamelist); top=tree.getroot(); media=set()\n for game in list(top.findall('game')):\n  gamepath=(game.findtext('path') or '').replace('\\\\','/').lstrip('./')\n  if any(gamepath==target or gamepath.startswith(target+'/') for target in targets):\n   for tag in ('image','thumbnail','marquee'):\n    value=game.findtext(tag)\n    if value: media.add(value)\n   top.remove(game); result['entriesRemoved']+=1\n if result['entriesRemoved']:\n  temporary=gamelist+'.rp1-remove-'+uuid.uuid4().hex; tree.write(temporary,encoding='utf-8',xml_declaration=True); os.replace(temporary,gamelist)\n  remaining=set()\n  for game in top.findall('game'):\n   for tag in ('image','thumbnail','marquee'):\n    value=game.findtext(tag)\n    if value: remaining.add(value)\n  realroot=os.path.realpath(root)\n  for value in media-remaining:\n   candidate=os.path.realpath(os.path.join(root,value.lstrip('./')))\n   if candidate.startswith(realroot+os.sep) and os.path.isfile(candidate): os.remove(candidate); result['picturesRemoved']+=1\nprint(json.dumps(result))`;
  const output = await execSsh(device, `python3 -c ${shellSingleQuoted(script)}`, 30000);
  return JSON.parse(String(output || "{}").trim() || "{}");
}

async function removePublishedArtwork(device, system, fileName) {
  const machine = device.instanceId || device.mac || device.host || device.name || "machine";
  const key = JSON.stringify([machine, system]);
  return withGamelistUpdateLock(key, () => removePublishedArtworkUnlocked(device, system, fileName));
}

async function removeRomSmb(device, system, fileName) {
  const remoteDir = smbPathForSystem(device.host, system, device.platform);
  if (system === 'windows') {
    const installedPath = path.win32.join(remoteDir, fileName);
    const installerPath = path.win32.join(smbShareRoot(device.host), 'roms', 'windows_installers', fileName);
    fs.rmSync(fs.existsSync(installedPath) ? installedPath : installerPath, { recursive: true, force: true });
    return;
  }
  const fileNames = system === "karaoke" ? [fileName, karaokePairName(fileName)] : (() => {
    try { return ps1TransferFiles(system, fileName).map(item => item.name); }
    catch { return [fileName]; }
  })();
  if (fileNames.length === 1 && (["music", "ps4", "xbox360", "ports", "pygame"].includes(system) || (system === "ps3" && path.extname(fileName).toLowerCase() === ".ps3"))) {
    fs.rmSync(path.win32.join(remoteDir, fileName), { recursive: true, force: true });
    return;
  }
  fileNames.forEach(name => {
    fs.rmSync(path.win32.join(remoteDir, name), { force: true });
  });
}

async function batoceraSystemContentRoots(device, system) {
  const roots = new Set([remoteDirFor(system, device)]);
  if (device.platform && device.platform !== "batocera") return [...roots];
  // 3dSen is a symlinked view of the NES library. Removing the virtual
  // console must remove only that link, never follow its game paths back to
  // /userdata/roms/nes.
  if (system === "3dsen") return [...roots];
  // Some Batocera entries (notably Ports) are group systems. Their games live
  // in several underlying ROM roots, so deleting only /roms/ports leaves the
  // group and its games visible. Resolve every member from Batocera's live API.
  try {
    const output = await execSsh(device, `curl --max-time 10 -fsS http://127.0.0.1:1234/systems/${systemFolders[system]}/games`, 15000);
    const games = JSON.parse(output);
    for (const game of Array.isArray(games) ? games : []) {
      const match = String(game?.path || "").match(/^\/userdata\/roms\/([^/]+)(?:\/|$)/);
      if (match && /^[a-z0-9._+-]+$/i.test(match[1])) roots.add(`/userdata/roms/${match[1]}`);
    }
  } catch { /* The direct system root remains the safe removal target. */ }
  return [...roots];
}

async function removeSystem(device, system, options = {}) {
  if (!Object.prototype.hasOwnProperty.call(systemFolders, system) || system === "music") {
    throw new Error("Unknown or non-removable system.");
  }
  if (system === "steam" && (device.access !== "ssh" || (device.platform && device.platform !== "batocera"))) {
    throw new Error("Connect to Batocera over SSH to remove Steam and its console entry.");
  }
  if (device.access === "usb") {
    const target = usbPathForSystem(device, system);
    fs.rmSync(target, {recursive:true, force:true});
    if (system === "windows") {
      fs.rmSync(path.win32.join(device.driveRoot, "userdata", "roms", "windows_installers"), {recursive:true, force:true});
      fs.rmSync(path.win32.join(device.driveRoot, "userdata", "roms", "windows_menu"), {recursive:true, force:true});
    }
    return { resetApplied: false };
  }
  if (device.access === "smb") {
    fs.rmSync(smbPathForSystem(device.host, system, device.platform), {recursive:true, force:true});
    if (system === "windows") {
      const root = smbShareRoot(device.host);
      fs.rmSync(path.win32.join(root, "roms", "windows_installers"), {recursive:true, force:true});
      fs.rmSync(path.win32.join(root, "roms", "windows_menu"), {recursive:true, force:true});
    }
    return { resetApplied: false };
  }
  const remoteDir = remoteDirFor(system, device);
  // Steam may be grouped with other Flatpaks. Never let a group-system scan
  // broaden removal to /userdata/roms/flatpak or another app's ROM root.
  const contentRoots = system === "steam"
    ? ["/userdata/roms/steam"]
    : await batoceraSystemContentRoots(device, system);
  if (system === "steam") {
    // Steam is a Flatpak, not just a ROM folder. Removing only the shortcuts
    // leaves the application installed and Batocera can recreate the system.
    // Handle both system-wide and batocera-user installations before removing
    // the exact Steam shortcut paths. Never touch other Flatpaks or PC files.
    await execSsh(device, [
      "set -e",
      "if flatpak info --system com.valvesoftware.Steam >/dev/null 2>&1; then flatpak uninstall --system --noninteractive --delete-data com.valvesoftware.Steam; fi",
      "if su - batocera -c 'flatpak info --user com.valvesoftware.Steam' >/dev/null 2>&1; then su - batocera -c 'flatpak uninstall --user --noninteractive --delete-data com.valvesoftware.Steam'; fi",
      "rm -f -- /userdata/roms/flatpak/steam.flatpak"
    ].join("; "), 120000);
  }
  const commands = contentRoots.map(target => `rm -rf -- ${shellSingleQuoted(target)}`);
  if (system === "3dsen") {
    const cleanup = Buffer.from(`import os, xml.etree.ElementTree as ET
p='/userdata/system/configs/emulationstation/es_systems.cfg'
if os.path.exists(p):
 tree=ET.parse(p); root=tree.getroot(); changed=False
 for node in list(root.findall('system')):
  if (node.findtext('name') or '').strip()=='3dsen': root.remove(node); changed=True
 if changed: tree.write(p,encoding='UTF-8',xml_declaration=True)
`, "utf8").toString("base64");
    commands.push(`printf '%s' '${cleanup}' | base64 -d | python3`);
    commands.push("rm -f -- /userdata/system/ready-player-one/3dsen-launch.sh");
    commands.push("rm -rf -- /userdata/system/ready-player-one/3dsen-runtime");
  }
  if (system === "pikaraoke") {
    commands.push("pkill -x pikaraoke 2>/dev/null || true");
    commands.push("rm -f -- /userdata/system/configs/emulationstation/es_systems_pikaraoke.cfg /userdata/system/scripts/pikaraoke-launch.sh /userdata/system/ready-player-one/pikaraoke/launch.sh");
    commands.push("rm -rf -- /userdata/system/ready-player-one/pikaraoke");
  }
  if (system === "windows" && (!device.platform || device.platform === "batocera")) {
    const cleanup = Buffer.from(`import os, xml.etree.ElementTree as ET
p='/userdata/system/configs/emulationstation/es_systems.cfg'
if os.path.exists(p):
    tree=ET.parse(p); root=tree.getroot(); changed=False
    for node in list(root.findall('system')):
        if (node.findtext('name') or '').strip() in ('windows','windows_shortcuts','windows_installers'):
            root.remove(node); changed=True
    if changed: tree.write(p, encoding='UTF-8', xml_declaration=True)
`, "utf8").toString("base64");
    commands.push("rm -rf -- /userdata/roms/windows_installers /userdata/roms/windows_menu");
    commands.push("rm -f -- /userdata/system/scripts/rp1-windows-menu-sync.sh /userdata/system/scripts/rp1-windows-menu-launch.sh /userdata/system/ready-player-one/windows-menu-sync.sh /userdata/system/ready-player-one/windows-menu-launch.sh /userdata/system/ready-player-one/windows-shortcuts.sh");
    commands.push(`printf '%s' '${cleanup}' | base64 -d | python3`);
  }
  await execSsh(device, commands.join("; "), 30000);
  const steamVerification = system === "steam"
    ? " && ! flatpak info --system com.valvesoftware.Steam >/dev/null 2>&1 && ! su - batocera -c 'flatpak info --user com.valvesoftware.Steam' >/dev/null 2>&1 && [ ! -e /userdata/roms/flatpak/steam.flatpak ]"
    : "";
  const verification = await execSsh(device, `${contentRoots.map(target => `[ ! -e ${shellSingleQuoted(target)} ]`).join(" && ")}${steamVerification} && echo REMOVED`, 15000);
  if (!verification.includes("REMOVED")) throw new Error(`Batocera did not fully remove ${system}.`);
  // Removing a system changes EmulationStation's visible system registry.
  // Use the same verified fallback chain as the Soft Reset button and do not
  // make the user perform a second manual action after a successful removal.
  const resetApplied = (!device.platform || device.platform === "batocera") && !options.deferReset;
  if (resetApplied) await runSoftReset(device);
  return { resetApplied, removedRoots: contentRoots };
}

async function removeRemotePath(sftp, remotePath) {
  const stat = await new Promise(resolve => {
    sftp.stat(remotePath, (error, attrs) => resolve(error ? null : attrs));
  });
  if (!stat) {
    return;
  }

  if (stat.isDirectory && stat.isDirectory()) {
    const entries = await new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (error, list) => error ? reject(error) : resolve(list));
    });
    for (const entry of entries) {
      await removeRemotePath(sftp, `${remotePath}/${entry.filename}`);
    }
    await new Promise((resolve, reject) => {
      sftp.rmdir(remotePath, error => error && error.code !== 2 ? reject(error) : resolve());
    });
    return;
  }

  await new Promise((resolve, reject) => {
    sftp.unlink(remotePath, error => error && error.code !== 2 ? reject(error) : resolve());
  });
}

const retroarchControls = {
  "P1 Up": "input_player1_up",
  "P1 Down": "input_player1_down",
  "P1 Left": "input_player1_left",
  "P1 Right": "input_player1_right",
  "P1 Start": "input_player1_start",
  "P1 Button 1": "input_player1_b",
  "P1 Button 2": "input_player1_a",
  "P1 Button 3": "input_player1_y",
  "P1 Button 4": "input_player1_x",
  "P1 Button 5": "input_player1_l",
  "P1 Button 6": "input_player1_r",
  "P1 Button 7": "input_player1_l2",
  "P1 Button 8": "input_player1_r2",
  "P2 Up": "input_player2_up",
  "P2 Down": "input_player2_down",
  "P2 Left": "input_player2_left",
  "P2 Right": "input_player2_right",
  "P2 Start": "input_player2_start",
  "P2 Button 1": "input_player2_b",
  "P2 Button 2": "input_player2_a",
  "P2 Button 3": "input_player2_y",
  "P2 Button 4": "input_player2_x",
  "P2 Button 5": "input_player2_l",
  "P2 Button 6": "input_player2_r",
  "P2 Button 7": "input_player2_l2",
  "P2 Button 8": "input_player2_r2",
  "Side Button 3": "input_player1_select",
  "Side Button 4": "input_player2_select",
  Select: "input_enable_hotkey",
  Menu: "input_menu_toggle",
  Back: "input_exit_emulator"
};

const keyboardToPadsConfigName = "BaolianindustryCoLtdArcade2TVWiredCtrlKM.v32be.p20a0.yml";

const keyboardToPadsControls = {
  "P1 Up": "abs:hat0y:-1",
  "P1 Down": "abs:hat0y:1",
  "P1 Left": "abs:hat0x:-1",
  "P1 Right": "abs:hat0x:1",
  "P1 Start": "btn:start",
  "P1 Button 1": "btn:south",
  "P1 Button 2": "btn:east",
  "P1 Button 3": "btn:west",
  "P1 Button 4": "btn:north",
  "P1 Button 5": "btn:tr",
  "P1 Button 6": "btn:tl",
  "P1 Button 7": "btn:tr2",
  "P1 Button 8": "btn:tl2",
  "Side Button 3": "btn:select",
  "P2 Up": "abs:hat0y:-1",
  "P2 Down": "abs:hat0y:1",
  "P2 Left": "abs:hat0x:-1",
  "P2 Right": "abs:hat0x:1",
  "P2 Start": "btn:start",
  "P2 Button 1": "btn:south",
  "P2 Button 2": "btn:east",
  "P2 Button 3": "btn:west",
  "P2 Button 4": "btn:north",
  "P2 Button 5": "btn:tr",
  "P2 Button 6": "btn:tl",
  "P2 Button 7": "btn:tr2",
  "P2 Button 8": "btn:tl2",
  "Side Button 4": "btn:select"
};

const retroarchKeys = {
  UP: "up",
  DOWN: "down",
  LEFT: "left",
  RIGHT: "right",
  ENTER: "enter",
  SPACE: "space",
  CTRL: "ctrl",
  ALT: "alt",
  SHIFT: "shift",
  ESC: "escape",
  TAB: "tab",
  BACKSPACE: "backspace",
  INSERT: "insert",
  DELETE: "delete",
  HOME: "home",
  END: "end",
  PGUP: "pageup",
  PGDN: "pagedown"
};

function normalizeRetroarchKey(keyName) {
  const key = String(keyName || "").trim().toUpperCase();
  if (!key) {
    return "";
  }

  if (/^F([1-9]|1[0-2])$/.test(key)) {
    return key.toLowerCase();
  }

  if (/^[A-Z0-9]$/.test(key)) {
    return key.toLowerCase();
  }

  return retroarchKeys[key] || key.toLowerCase();
}

function normalizeKeyboardToPadsKey(keyName) {
  const key = String(keyName || "").trim().toUpperCase();
  const special = {
    UP: "up",
    DOWN: "down",
    LEFT: "left",
    RIGHT: "right",
    CTRL: "leftctrl",
    ALT: "leftalt",
    SHIFT: "leftshift",
    SPACE: "space",
    ENTER: "enter",
    ESC: "esc",
    TAB: "tab",
    BACKSPACE: "backspace",
    INSERT: "insert",
    DELETE: "delete",
    HOME: "home",
    END: "end",
    PGUP: "pageup",
    PGDN: "pagedown"
  };

  if (/^[A-Z0-9]$/.test(key)) {
    return key.toLowerCase();
  }

  if (/^F([1-9]|1[0-2])$/.test(key)) {
    return key.toLowerCase();
  }

  return special[key] || key.toLowerCase();
}

function normalizeIpacKey(value) {
  const raw = typeof value === "object" && value
    ? String(value.rawKey || value.key || value.code || "")
    : String(value || "");
  const code = typeof value === "object" && value ? String(value.code || "") : "";
  const key = raw.trim();
  const upper = key.toUpperCase();

  if (!key) {
    return "";
  }

  const special = {
    ARROWUP: "up",
    "UP ARROW": "up",
    UP: "up",
    ARROWDOWN: "down",
    "DOWN ARROW": "down",
    DOWN: "down",
    ARROWLEFT: "left",
    "LEFT ARROW": "left",
    LEFT: "left",
    ARROWRIGHT: "right",
    "RIGHT ARROW": "right",
    RIGHT: "right",
    " ": "space",
    SPACE: "space",
    ENTER: "enter",
    RETURN: "enter",
    ESCAPE: "esc",
    ESC: "esc",
    TAB: "tab",
    BACKSPACE: "backspace",
    DELETE: "delete",
    DEL: "delete",
    INSERT: "insert",
    INS: "insert",
    HOME: "home",
    END: "end",
    PAGEUP: "page up",
    PGUP: "page up",
    PAGEDOWN: "page down",
    PGDN: "page down"
  };

  if (code === "ControlRight" || upper === "CTRL R" || upper === "CONTROLRIGHT") {
    return "ctrl r";
  }
  if (code === "AltRight" || upper === "ALT R" || upper === "ALTRIGHT") {
    return "alt r";
  }
  if (code === "ShiftRight" || upper === "SHIFT R" || upper === "SHIFTRIGHT") {
    return "shift r";
  }
  if (code === "ControlLeft" || upper === "CONTROL" || upper === "CTRL" || upper === "CONTROLLEFT") {
    return "ctrl l";
  }
  if (code === "AltLeft" || upper === "ALT" || upper === "ALTLEFT") {
    return "alt l";
  }
  if (code === "ShiftLeft" || upper === "SHIFT" || upper === "SHIFTLEFT") {
    return "shift l";
  }

  if (/^[A-Z0-9]$/.test(upper)) {
    return upper.toLowerCase();
  }
  if (/^F([1-9]|1[0-2])$/.test(upper)) {
    return upper.toLowerCase();
  }

  return special[upper] || key.toLowerCase();
}

function buildIpac4Config(remaps) {
  if (!fs.existsSync(ipac4DefaultPath)) {
    throw new Error("Missing ipac4-default.json.");
  }

  const config = JSON.parse(fs.readFileSync(ipac4DefaultPath, "utf8").replace(/^\uFEFF/, ""));
  const pins = config.pins || {};
  const reversePins = new Map();

  Object.entries(pins).forEach(([pin, details]) => {
    const key = normalizeIpacKey(details && details.key);
    if (!key) {
      return;
    }
    if (!reversePins.has(key)) {
      reversePins.set(key, []);
    }
    reversePins.get(key).push(pin);
  });

  const applied = [];
  const unresolved = [];
  (Array.isArray(remaps) ? remaps : []).forEach(pair => {
    const fromKey = normalizeIpacKey(pair && pair.from);
    const toKey = normalizeIpacKey(pair && pair.to);
    const matchingPins = reversePins.get(fromKey) || [];
    const pin = matchingPins[0];

    if (!fromKey || !toKey || !pin || !pins[pin]) {
      unresolved.push({
        from: pair && pair.from ? pair.from.key || pair.from.rawKey : "",
        to: pair && pair.to ? pair.to.key || pair.to.rawKey : "",
        reason: !pin ? "No IPAC4 default pin uses that source key." : "Incomplete remap."
      });
      return;
    }

    pins[pin].key = toKey;
    applied.push({
      pin,
      from: fromKey,
      to: toKey
    });
  });

  config.generatedBy = "Ready Player One";
  config.generatedAt = new Date().toISOString();
  config.appliedRemaps = applied;
  fs.writeFileSync(ipac4GeneratedPath, JSON.stringify(config, null, 2));

  return {
    file: ipac4GeneratedPath,
    applied,
    unresolved
  };
}

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

function buildControllerInstallFiles(controller, mode, mappings) {
  const cleanMappings = Array.isArray(mappings)
    ? mappings
        .filter(item => item && item.control && item.keyName)
        .map(item => ({
          control: String(item.control),
          key: String(item.key || item.keyName),
          keyName: String(item.keyName)
        }))
    : [];

  const layout = {
    controller,
    mode,
    generatedBy: "Ready Player One",
    generatedAt: new Date().toISOString(),
    mappings: cleanMappings
  };

  const lines = [
    "",
    "# Batocera Warehouse Arcade2TV-XR start",
    "controllers.xarcade.enabled=1",
    "# Layout is installed in /userdata/system/configs/keyboardToPads/inputs/" + keyboardToPadsConfigName
  ];

  lines.push("# Batocera Warehouse Arcade2TV-XR end", "");
  const p1Lines = [];
  const p2Lines = [];

  cleanMappings.forEach(item => {
    const output = keyboardToPadsControls[item.control];
    const input = normalizeKeyboardToPadsKey(item.keyName);
    if (!output || !input) {
      return;
    }

    const line = `      ${yamlQuote(`key:${input}`)}: ${yamlQuote(output)}`;
    if (item.control.startsWith("P2 ") || item.control === "Side Button 4") {
      p2Lines.push(line);
    } else {
      p1Lines.push(line);
    }
  });

  const keyboardToPadsYaml = [
    "# X-Arcade XArcade2TV-XR",
    "# Generated by Ready Player One",
    "target_devices:",
    "  - name: X-Arcade Player 1",
    "    type: joystick",
    "    mapping:",
    ...p1Lines,
    "  - name: X-Arcade Player 2",
    "    type: joystick",
    "    mapping:",
    ...p2Lines,
    ""
  ].join("\n");

  return {
    layoutJson: JSON.stringify(layout, null, 2),
    confBlock: lines.join("\n"),
    keyboardToPadsYaml
  };
}

function installController(device, controller, mode, mappings) {
  if (controller !== "arcade") {
    throw new Error("Only Arcade2TV-XR install is wired for Batocera right now.");
  }

  const installFiles = buildControllerInstallFiles(controller, mode, mappings);
  const layoutPayload = Buffer.from(installFiles.layoutJson, "utf8").toString("base64");
  const confPayload = Buffer.from(installFiles.confBlock, "utf8").toString("base64");
  const keyboardToPadsPayload = Buffer.from(installFiles.keyboardToPadsYaml, "utf8").toString("base64");

  return new Promise((resolve, reject) => {
    const client = new Client();
    const command = "set -e; " +
      "conf=/userdata/system/batocera.conf; " +
      "dir=/userdata/system/configs/batocera-warehouse; " +
      "ktpdir=/userdata/system/configs/keyboardToPads/inputs; " +
      "ktp=\"$ktpdir/" + keyboardToPadsConfigName + "\"; " +
      "layout=\"$dir/arcade2tv-xr-layout.json\"; " +
      "block=\"$dir/arcade2tv-xr-batocera-conf.txt\"; " +
      "mkdir -p /userdata/system \"$dir\" \"$ktpdir\"; " +
      "[ -f \"$conf\" ] || touch \"$conf\"; " +
      "cp \"$conf\" \"$conf.bak-xarcade\" 2>/dev/null || true; " +
      "printf '%s' '" + layoutPayload + "' | base64 -d > \"$layout\"; " +
      "printf '%s' '" + confPayload + "' | base64 -d > \"$block\"; " +
      "printf '%s' '" + keyboardToPadsPayload + "' | base64 -d > \"$ktp\"; " +
      "keyboardToPads --config \"$ktp\" --rules >/tmp/bw-arcade2tv.rules; " +
      "awk 'BEGIN{skip=0} /^# Batocera Warehouse Arcade2TV-XR start$/{skip=1; next} /^# Batocera Warehouse Arcade2TV-XR end$/{skip=0; next} !skip{print}' \"$conf\" > \"$conf.tmp\"; " +
      "cat \"$block\" >> \"$conf.tmp\"; " +
      "mv \"$conf.tmp\" \"$conf\"; " +
      "sync; " +
      "dev=$(keyboardToPads --search 2>/dev/null | sed -n 's/.*config=\"" + keyboardToPadsConfigName.replace(/\./g, "\\.") + "\" device=\"\\([^\"]*\\)\".*/\\1/p' | head -1); " +
      "pkill evsieve >/dev/null 2>&1 || true; " +
      "if [ -n \"$dev\" ]; then keyboardToPadsLauncher \"$dev\" run >/dev/null 2>&1 || true; fi; " +
      "(batocera-es-swissknife --restart >/dev/null 2>&1 || true); " +
      "grep -Eq '^[[:space:]]*controllers\\.xarcade\\.enabled[[:space:]]*=[[:space:]]*1[[:space:]]*$' \"$conf\" && echo OK";
    let settled = false;
    const timeout = setTimeout(() => {
      fail(new Error("Controller install timed out before Batocera confirmed it."));
    }, 15000);

    const fail = error => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        client.end();
        reject(error);
      }
    };

    client
      .on("ready", () => {
        client.exec(command, (error, stream) => {
          if (error) {
            fail(error);
            return;
          }

          let stdout = "";
          let stderr = "";
          stream.on("data", chunk => {
            stdout += chunk.toString();
            if (stdout.indexOf("OK") >= 0 && !settled) {
              settled = true;
              clearTimeout(timeout);
              client.end();
              resolve();
            }
          });
          stream.stderr.on("data", chunk => {
            stderr += chunk.toString();
          });
          stream.on("close", code => {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              client.end();
              if (code === 0 && stdout.indexOf("OK") >= 0) {
                resolve();
              } else {
                reject(new Error(stderr.trim() || stdout.trim() || `controller install exited with code ${code}`));
              }
            }
          });
        });
      })
      .on("error", fail)
      .connect({
        host: device.host,
        username: device.user,
        password: device.password,
        readyTimeout: 8000,
        tryKeyboard: false
      });
  });
}

function shellSingleQuoted(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const usbControllerPython = fs.readFileSync(path.join(uiRoot, 'usb-controller.py'), 'utf8');

async function installUsbController(device) {
  if (!device || device.access !== "ssh" || (device.platform && device.platform !== "batocera")) {
    throw new Error("Select a live Batocera machine with SSH access.");
  }
  const verification = Buffer.from(String.raw`
import datetime, fcntl, json, time
error = "The library inventory is not ready."
for attempt in range(15):
    try:
        with open('/userdata/system/ready-player-one/usb-controller.lock') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                pass
            else:
                raise RuntimeError('The USB Controller background service is not running.')
        with open('/boot/ready-player-one/library.json', encoding='utf-8') as stream:
            data = json.load(stream)
        if data.get('schemaVersion') != 1 or data.get('controllerVersion') != 2 or not isinstance(data.get('systems'), dict):
            raise RuntimeError('The USB library JSON has an invalid format.')
        updated = datetime.datetime.fromisoformat(data['updatedAt'])
        age = (datetime.datetime.now(datetime.timezone.utc) - updated).total_seconds()
        if not -5 <= age <= 90:
            raise RuntimeError('The USB library JSON is stale; the service is not updating it.')
        print('USB_CONTROLLER_VERIFIED=' + json.dumps({'controllerVersion': 2, 'updatedAt': data['updatedAt'], 'systemCount': len(data['systems']), 'entryCount': sum(len(entries) for entries in data['systems'].values())}))
        break
    except Exception as exc:
        error = str(exc)
        time.sleep(1)
else:
    raise SystemExit('USB Controller verification failed: ' + error)
`, "utf8").toString("base64");
  const directory = '/userdata/system/ready-player-one';
  await sftpWithDevice(device, async (sftp, client) => {
    await execOnSshClient(client, `mkdir -p ${directory}`);
    for (const [name, content] of [
      ['usb-controller-next.py', usbControllerPython],
      ['usb-boot-next.sh', fs.readFileSync(path.join(uiRoot,'usb-boot.sh'))],
      ['usb-install.py', fs.readFileSync(path.join(uiRoot,'usb-install.py'))],
      ['usb-verify.py', Buffer.from(verification,'base64')]
    ]) {
      await writeSftpFile(sftp,`${directory}/${name}.upload`,content);
      await execOnSshClient(client,`mv ${directory}/${name}.upload ${directory}/${name}`);
    }
  });
  const command = `python3 ${directory}/usb-install.py ${directory}/usb-controller-next.py ${directory}/usb-boot-next.sh && python3 ${directory}/usb-verify.py`;
  const output = await execSsh(device, command, 90000);
  const verified = output.match(/^USB_CONTROLLER_VERIFIED=(.+)$/m);
  if (!verified) throw new Error("USB Controller was installed, but its library JSON was not verified.");
  return { installed: true, path: "/boot/ready-player-one/library.json", refreshSeconds: 30, ...JSON.parse(verified[1]) };
}

const keypadAction = require('./keypad')({getRuntimeDevice, execSsh, root, stageRemote: async(device,script,request) => {
  const directory='/userdata/system/configs/ready-player-one';
  const scriptPath=`${directory}/keypad-runtime.py`;
  const requestPath=`${directory}/keypad-request.json`;
  await sftpWithDedicatedDevice(device, async sftp => {
    await mkdirpSftp(sftp,directory);
    await writeSftpFile(sftp,`${scriptPath}.upload`,script);
    await writeSftpFile(sftp,`${requestPath}.upload`,request);
    await new Promise((resolve,reject)=>sftp.rename(`${scriptPath}.upload`,scriptPath,error=>error?reject(error):resolve()));
    await new Promise((resolve,reject)=>sftp.rename(`${requestPath}.upload`,requestPath,error=>error?reject(error):resolve()));
  });
  return {script:scriptPath,request:requestPath};
}});
const backupCategories = {
  configuration: {label:"Configuration", command:"tar -czf - --exclude='system/cache' --exclude='system/cache/*' --exclude='system/logs' --exclude='system/logs/*' -C /userdata system"},
  covers: {label:"Covers", command:"cd /userdata && find roms -type f \\( -path '*/media/*' -o -name gamelist.xml \\) -print0 | tar --null -T - -czf -"},
  games: {label:"Games", command:"tar -czf - --exclude='roms/*/media' --exclude='roms/*/media/*' --exclude='roms/*/gamelist.xml' --exclude='roms/*/theme.xml' -C /userdata roms"},
  "memory-card": {label:"Memory-Card", command:"tar -czf - --exclude='*.state' --exclude='*.state.*' --exclude='*.state[0-9]*' -C /userdata saves"},
  "save-states": {label:"Save States", command:"cd /userdata && find saves -type f \\( -name '*.state' -o -name '*.state.*' -o -regex '.*\\.state[0-9]+$' \\) -print0 | tar --null -T - -czf -"}
};
const rp1ConfigurationFiles = [
  "controller-settings.json", "ipac4-default.json", "ipac4-generated.json",
  "keypad-layouts.json", "scraper-settings.json", "uefi-settings.json"
];
let backupRestoreJob = {running:false,mode:"",device:"",backupId:"",categories:[],completed:[],current:"",errors:[],finishedAt:""};
let usbImageJob = {running:false,device:"",sourceType:"",sourceLabel:"",disk:"",diskSize:0,bytesWritten:0,destination:"",startedAt:"",finishedAt:"",cancelled:false,error:""};
let usbImageControl = null;

function publicUsbImageJob() {
  const { running, device, sourceType, sourceLabel, disk, diskSize, bytesWritten, destination, startedAt, finishedAt, cancelled, error } = usbImageJob;
  return { running, device, sourceType, sourceLabel, disk, diskSize, bytesWritten, destination, startedAt, finishedAt, cancelled, error };
}

async function inspectUsbImageSource(deviceName, device) {
  if (!device || device.access !== "ssh") throw new Error("Select a connected machine with SSH access.");
  const command = `set -e
src=''
for mount in /boot /userdata /recalbox/share /; do
  candidate=$(findmnt -n -o SOURCE "$mount" 2>/dev/null || true)
  case "$candidate" in /dev/*) src=$(readlink -f "$candidate"); break;; esac
done
[ -n "$src" ] && [ -b "$src" ] || { echo 'Could not identify the machine boot device.' >&2; exit 2; }
parent=$(lsblk -ndo PKNAME "$src" 2>/dev/null | head -n 1)
if [ -n "$parent" ]; then disk="/dev/$parent"; else disk="$src"; fi
case "$disk" in /dev/sd[a-z]*|/dev/vd[a-z]*|/dev/mmcblk[0-9]*|/dev/nvme[0-9]*n[0-9]*) ;; *) echo 'Unsupported boot disk.' >&2; exit 3;; esac
size=$(blockdev --getsize64 "$disk")
model=$(lsblk -ndo MODEL "$disk" 2>/dev/null | head -n 1 | tr -d '\\r')
transport=$(lsblk -ndo TRAN "$disk" 2>/dev/null | head -n 1 | tr -d '\\r')
printf 'DISK=%s\nSIZE=%s\nMODEL=%s\nTRANSPORT=%s\n' "$disk" "$size" "$model" "$transport"`;
  const output = await execSsh(device, command, 20000);
  const values = Object.fromEntries(output.split(/\r?\n/).map(line => line.match(/^([A-Z]+)=(.*)$/)).filter(Boolean).map(match => [match[1], match[2].trim()]));
  if (!/^\/dev\/(?:sd[a-z]+|vd[a-z]+|mmcblk\d+|nvme\d+n\d+)$/.test(values.DISK || "")) throw new Error("RP1 could not safely identify the machine's complete boot disk.");
  const diskSize = Number(values.SIZE);
  if (!Number.isSafeInteger(diskSize) || diskSize <= 0) throw new Error("RP1 could not read the boot disk size.");
  fs.mkdirSync(usbImagesPath, { recursive: true });
  const storage = fs.statfsSync(usbImagesPath);
  const availableBytes = Number(storage.bavail) * Number(storage.bsize);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(usbImagesPath, `${safeBackupMachineName(deviceName)}-${stamp}.img`);
  return { id:"remote", type:"remote", label:`${deviceName} — Network`, device: deviceName, disk: values.DISK, diskSize, model: values.MODEL || "Unknown disk", transport: values.TRANSPORT || "Network", availableBytes, destination };
}

async function inspectLocalUsbImageSources(deviceName) {
  if (process.platform !== "win32") return [];
  const command = [
    "$items = Get-Disk | Where-Object { $_.BusType -eq 'USB' -and -not $_.IsBoot -and -not $_.IsSystem -and $_.OperationalStatus -notcontains 'Offline' } | ForEach-Object {",
    "  $disk = $_; $letters = @(); $batocera = $false",
    "  Get-Partition -DiskNumber $disk.Number -ErrorAction SilentlyContinue | ForEach-Object {",
    "    $partition = $_; $partition.DriveLetter | Where-Object { $_ } | ForEach-Object {",
    "      $letter = [string]$_; $letters += ($letter + ':')",
    "      $root = $letter + ':\\'",
    "      if ((Test-Path -LiteralPath ($root + 'batocera-boot.conf')) -or (Test-Path -LiteralPath ($root + 'boot\\batocera'))) { $batocera = $true }",
    "      try { if ((Get-Volume -DriveLetter $letter -ErrorAction Stop).FileSystemLabel -match 'BATOCERA|SHARE') { $batocera = $true } } catch {}",
    "    }",
    "  }",
    "  if ($batocera) { [pscustomobject]@{ Number=[int]$disk.Number; Model=[string]$disk.FriendlyName; Serial=[string]$disk.SerialNumber; Size=[uint64]$disk.Size; BusType=[string]$disk.BusType; Drives=($letters -join ', ') } }",
    "}",
    "$items | ConvertTo-Json -Compress"
  ].join("; ");
  const output = await execFileText("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], 20000);
  if (!output.trim()) return [];
  let parsed;
  try { parsed = JSON.parse(output); } catch { return []; }
  const disks = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  fs.mkdirSync(usbImagesPath, { recursive: true });
  const storage = fs.statfsSync(usbImagesPath);
  const availableBytes = Number(storage.bavail) * Number(storage.bsize);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return disks.map(item => {
    const number = Number(item.Number);
    const diskSize = Number(item.Size);
    if (!Number.isInteger(number) || number < 0 || !Number.isSafeInteger(diskSize) || diskSize <= 0) return null;
    const model = String(item.Model || "USB disk").trim() || "USB disk";
    const drives = String(item.Drives || "").trim();
    return {
      id:`local:${number}`, type:"local", label:`${model}${drives ? ` (${drives})` : ""} — Local USB`, device:deviceName,
      disk:`\\\\.\\PhysicalDrive${number}`, diskNumber:number, diskSize, model, serial:String(item.Serial || "").trim(),
      transport:"USB", drives, availableBytes,
      destination:path.join(usbImagesPath, `${safeBackupMachineName(deviceName)}-local-usb-${number}-${stamp}.img`)
    };
  }).filter(Boolean);
}

async function inspectUsbImageSources(deviceName, device) {
  const sources = [];
  try { sources.push(await inspectUsbImageSource(deviceName, device)); } catch {}
  sources.push(...await inspectLocalUsbImageSources(deviceName));
  if (!sources.length) throw new Error("No connected machine or local Batocera USB disk is available for imaging.");
  return sources;
}

function createUsbImage(deviceName, device, source) {
  const partial = `${source.destination}.partial`;
  usbImageJob = {running:true,device:deviceName,sourceType:"remote",sourceLabel:source.label,disk:source.disk,diskSize:source.diskSize,bytesWritten:0,destination:source.destination,startedAt:new Date().toISOString(),finishedAt:"",cancelled:false,error:""};
  fs.mkdirSync(path.dirname(source.destination), { recursive: true });
  try { fs.rmSync(partial, { force: true }); } catch {}
  const client = new Client();
  const output = fs.createWriteStream(partial, { flags: "wx" });
  let commandStream = null;
  let settled = false;
  const finish = (error, cancelled = false) => {
    if (settled) return;
    settled = true;
    usbImageControl = null;
    try { commandStream?.destroy(); } catch {}
    try { output.destroy(); } catch {}
    try { client.end(); } catch {}
    usbImageJob.running = false;
    usbImageJob.finishedAt = new Date().toISOString();
    usbImageJob.cancelled = cancelled;
    usbImageJob.error = error ? String(error.message || error) : "";
    if (error || cancelled) {
      const removePartial = () => { try { fs.rmSync(partial, { force: true }); } catch {} };
      removePartial();
      output.once("close", removePartial);
    }
  };
  usbImageControl = { cancel() {
    if (!usbImageJob.running) return;
    try { commandStream?.signal("TERM"); } catch {}
    finish(new Error("USB image creation was cancelled."), true);
  }};
  output.on("error", finish);
  client.on("ready", () => client.exec(`sync; dd if=${source.disk} bs=4194304 status=none`, (error, stream) => {
    if (error) return finish(error);
    commandStream = stream;
    let stderr = "";
    stream.stderr.on("data", chunk => { stderr += chunk.toString(); });
    stream.on("data", chunk => {
      usbImageJob.bytesWritten += chunk.length;
      if (!output.write(chunk)) { stream.pause(); output.once("drain", () => stream.resume()); }
    });
    stream.on("close", code => {
      if (settled) return;
      if (code !== 0) return finish(new Error(stderr.trim() || `Disk imaging stopped with code ${code}.`));
      output.end(() => {
        if (settled) return;
        if (usbImageJob.bytesWritten !== source.diskSize) return finish(new Error(`The image was incomplete (${usbImageJob.bytesWritten} of ${source.diskSize} bytes).`));
        try {
          fs.renameSync(partial, source.destination);
          settled = true;
          usbImageControl = null;
          client.end();
          usbImageJob.running = false;
          usbImageJob.finishedAt = new Date().toISOString();
        } catch (renameError) { finish(renameError); }
      });
    });
  })).on("error", finish).connect({host:device.host,username:device.user,password:device.password,readyTimeout:8000,tryKeyboard:false,keepaliveInterval:15000,keepaliveCountMax:4});
}

function createLocalUsbImage(deviceName, source) {
  const partial = `${source.destination}.partial`;
  usbImageJob = {running:true,device:deviceName,sourceType:"local",sourceLabel:source.label,disk:source.disk,diskSize:source.diskSize,bytesWritten:0,destination:source.destination,startedAt:new Date().toISOString(),finishedAt:"",cancelled:false,error:""};
  fs.mkdirSync(path.dirname(source.destination), { recursive: true });
  try { fs.rmSync(partial, { force: true }); } catch {}
  const input = fs.createReadStream(source.disk, { highWaterMark: 4 * 1024 * 1024 });
  const output = fs.createWriteStream(partial, { flags:"wx" });
  let settled = false;
  const finish = (error, cancelled = false) => {
    if (settled) return;
    settled = true;
    usbImageControl = null;
    try { input.destroy(); } catch {}
    try { output.destroy(); } catch {}
    usbImageJob.running = false;
    usbImageJob.finishedAt = new Date().toISOString();
    usbImageJob.cancelled = cancelled;
    usbImageJob.error = error ? String(error.code === "EACCES" || error.code === "EPERM"
      ? "Windows denied raw USB access. Close RP1, then run it as Administrator and try again."
      : error.message || error) : "";
    if (error || cancelled) {
      const removePartial = () => { try { fs.rmSync(partial, { force:true }); } catch {} };
      removePartial(); output.once("close", removePartial);
    }
  };
  usbImageControl = { cancel() { if (usbImageJob.running) finish(new Error("USB image creation was cancelled."), true); } };
  input.on("error", finish);
  output.on("error", finish);
  input.on("data", chunk => { usbImageJob.bytesWritten += chunk.length; });
  input.pipe(output);
  output.on("finish", () => {
    if (settled) return;
    if (usbImageJob.bytesWritten !== source.diskSize) return finish(new Error(`The image was incomplete (${usbImageJob.bytesWritten} of ${source.diskSize} bytes).`));
    try {
      fs.renameSync(partial, source.destination);
      settled = true; usbImageControl = null; usbImageJob.running = false; usbImageJob.finishedAt = new Date().toISOString();
    } catch (error) { finish(error); }
  });
}

function safeBackupMachineName(value) {
  return String(value || "Batocera").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "Batocera";
}

function listMachineBackups(deviceName) {
  const machineDir = path.join(backupsPath, safeBackupMachineName(deviceName));
  if (!fs.existsSync(machineDir)) return [];
  return fs.readdirSync(machineDir, {withFileTypes:true}).filter(entry => entry.isDirectory()).map(entry => {
    const folder = path.join(machineDir, entry.name);
    let manifest = {};
    try { manifest = JSON.parse(fs.readFileSync(path.join(folder,"manifest.json"),"utf8")); } catch {}
    const categories = Object.keys(backupCategories).filter(key => fs.existsSync(path.join(folder,`${key}.tar.gz`)));
    return {id:entry.name,createdAt:manifest.createdAt || entry.name,categories};
  }).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function backupRp1Configuration(folder) {
  const destination = path.join(folder,"rp1-configuration");
  fs.mkdirSync(destination,{recursive:true});
  for (const name of rp1ConfigurationFiles) {
    const source = path.join(root,name);
    if (fs.existsSync(source) && fs.statSync(source).isFile()) fs.copyFileSync(source,path.join(destination,name));
  }
}

function restoreRp1Configuration(folder) {
  const sourceFolder = path.join(folder,"rp1-configuration");
  if (!fs.existsSync(sourceFolder)) return;
  for (const name of rp1ConfigurationFiles) {
    const source = path.join(sourceFolder,name);
    if (fs.existsSync(source) && fs.statSync(source).isFile()) fs.copyFileSync(source,path.join(root,name));
  }
}

async function getBackupCategorySizes(device) {
  const command = `printf 'configuration='; find /userdata/system -type f ! -path '/userdata/system/cache/*' ! -path '/userdata/system/logs/*' -exec stat -c %s {} + 2>/dev/null | awk '{s+=$1} END {print s+0}'
printf 'covers='; find /userdata/roms -type f \\( -path '*/media/*' -o -name gamelist.xml \\) -exec stat -c %s {} + 2>/dev/null | awk '{s+=$1} END {print s+0}'
printf 'games='; find /userdata/roms -type f ! -path '*/media/*' ! -name gamelist.xml ! -name theme.xml -exec stat -c %s {} + 2>/dev/null | awk '{s+=$1} END {print s+0}'
printf 'memory-card='; find /userdata/saves -type f ! -name '*.state' ! -name '*.state.*' ! -name '*.state[0-9]*' -exec stat -c %s {} + 2>/dev/null | awk '{s+=$1} END {print s+0}'
printf 'save-states='; find /userdata/saves -type f \\( -name '*.state' -o -name '*.state.*' -o -regex '.*\\.state[0-9]+$' \\) -exec stat -c %s {} + 2>/dev/null | awk '{s+=$1} END {print s+0}'`;
  const output = await execSsh(device,command,120000);
  const sizes = Object.fromEntries(output.trim().split(/\r?\n/).map(line => line.split("=")).filter(parts => backupCategories[parts[0]]).map(([key,value]) => [key,Number(value) || 0]));
  sizes.configuration = (sizes.configuration || 0) + rp1ConfigurationFiles.reduce((sum,name) => {
    const file = path.join(root,name);
    try { return sum + fs.statSync(file).size; } catch { return sum; }
  },0);
  return sizes;
}

async function runBackupRestore(deviceName, device, mode, categories, backupId="") {
  backupRestoreJob = {running:true,mode,device:deviceName,backupId,categories,completed:[],current:"",errors:[],finishedAt:""};
  try {
    const machineDir = path.join(backupsPath, safeBackupMachineName(deviceName));
    let folder;
    if (mode === "backup") {
      const id = new Date().toISOString().replace(/[:.]/g,"-");
      backupRestoreJob.backupId = id;
      folder = path.join(machineDir,id); fs.mkdirSync(folder,{recursive:true});
    } else {
      if (!/^[a-z0-9._-]+$/i.test(backupId)) throw new Error("Invalid backup selection.");
      folder = path.join(machineDir,backupId);
      if (!fs.existsSync(folder)) throw new Error("That backup no longer exists.");
    }
    for (const key of categories) {
      backupRestoreJob.current = key;
      const archive = path.join(folder,`${key}.tar.gz`);
      if (mode === "backup") {
        await streamSshToFile(device, backupCategories[key].command, archive);
        if (key === "configuration") backupRp1Configuration(folder);
      }
      else {
        if (!fs.existsSync(archive)) throw new Error(`${backupCategories[key].label} is not present in this backup.`);
        await streamFileToSsh(device, archive, "tar -xzf - -C /userdata");
        if (key === "configuration") restoreRp1Configuration(folder);
      }
      backupRestoreJob.completed.push(key);
    }
    if (mode === "backup") fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify({version:1,device:deviceName,host:device.host,createdAt:new Date().toISOString(),categories},null,2));
  } catch (error) { backupRestoreJob.errors.push(error.message); }
  backupRestoreJob.running = false; backupRestoreJob.current = ""; backupRestoreJob.finishedAt = new Date().toISOString();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, {ok:true, app:'ready-player-one', version:require('../package.json').version,
        sourceHash: runningSourceHash, pid: process.pid,
        capabilities:['usb-controller-v1','usb-deletions-v1','versioned-backend-v1']});
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/system-art/")) {
      const folder = decodeURIComponent(url.pathname.slice("/api/system-art/".length));
      if (!batoceraSystemArtFolders.has(folder)) {
        sendJson(res, 404, { ok: false, error: "Unknown Batocera system artwork." });
        return;
      }
      fs.mkdirSync(systemArtCachePath, { recursive: true });
      const isSupplemental = Boolean(supplementalSystemArt[folder]);
      const extension = isSupplemental ? "png" : "svg";
      const cached = path.join(systemArtCachePath, `${folder}.${extension}`);
      if (!fs.existsSync(cached)) {
        const bundled = path.join(uiRoot, "system-art", `${folder}.png`);
        if (isSupplemental && fs.existsSync(bundled)) {
          fs.copyFileSync(bundled, cached);
        } else {
        const source = supplementalSystemArt[folder] ||
          `https://raw.githubusercontent.com/batocera-linux/batocera-themes/master/themes/batocera/${folder}/_data/svg/console.svg`;
        const response = await fetch(source, {
          headers: { "User-Agent": "ReadyPlayerOne/1.0 (local console artwork cache)" },
          signal: AbortSignal.timeout(30000)
        });
        if (!response.ok) throw new Error(`Batocera artwork returned ${response.status} for ${folder}.`);
        const artwork = Buffer.from(await response.arrayBuffer());
        if (isSupplemental) {
          if (artwork.length < 8 || artwork.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
            throw new Error(`Supplemental artwork for ${folder} is not a valid PNG.`);
          }
        } else if (!/^\s*<svg[\s>]/i.test(artwork.toString("utf8"))) {
          throw new Error(`Batocera artwork for ${folder} is invalid.`);
        }
        fs.writeFileSync(cached, artwork);
        }
      }
      res.writeHead(200, {
        "Content-Type": isSupplemental ? "image/png" : "image/svg+xml",
        "Cache-Control": "public, max-age=604800"
      });
      // Console icons are small UI assets. Send each in one response instead
      // of a file stream whose chunks can be starved by active SFTP callbacks.
      res.end(fs.readFileSync(cached));
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store"
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/device/screenshot") {
      const device = await getRuntimeDevice(url.searchParams.get("device") || "");
      if (!device || device.access !== "ssh" || device.platform && device.platform !== "batocera") {
        sendJson(res, 409, { ok: false, error: "A live Batocera machine with SSH access is required." });
        return;
      }
      const remotePath = "/userdata/screenshots/rp1-current-screen.png";
      await execSsh(device, `mkdir -p /userdata/screenshots; rm -f ${shellSingleQuoted(remotePath)}; batocera-screenshot ${shellSingleQuoted(remotePath)} >/dev/null 2>&1 & i=0; while [ $i -lt 40 ]; do [ -s ${shellSingleQuoted(remotePath)} ] && exit 0; sleep 0.25; i=$((i+1)); done; exit 1`, 15000);
      const screenshot = await sftpWithDevice(device, sftp => readSftpBuffer(sftp, remotePath));
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": screenshot.length,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(screenshot);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/backup-restore/status") {
      const deviceName = url.searchParams.get("device") || "";
      sendJson(res, 200, {ok:true, job:backupRestoreJob, backups:listMachineBackups(deviceName), categories:Object.entries(backupCategories).map(([id,item]) => ({id,label:item.label}))});
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/backup-restore/sizes") {
      const deviceName = url.searchParams.get("device") || "";
      const device = await getRuntimeDevice(deviceName);
      sendJson(res,200,{ok:true,sizes:await getBackupCategorySizes(device)});
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/backup-restore/start") {
      if (backupRestoreJob.running) { sendJson(res,409,{ok:false,error:"A backup or restore is already running."}); return; }
      const body = JSON.parse((await readBody(req)) || "{}");
      const mode = body.mode === "restore" ? "restore" : "backup";
      const categories = [...new Set(Array.isArray(body.categories) ? body.categories : [])].filter(key => backupCategories[key]);
      if (!categories.length) { sendJson(res,400,{ok:false,error:"Select at least one category."}); return; }
      const device = await getRuntimeDevice(body.device);
      runBackupRestore(body.device,device,mode,categories,String(body.backupId || ""));
      sendJson(res,202,{ok:true,job:backupRestoreJob});
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/usb-image/preflight") {
      const deviceName = url.searchParams.get("device") || "";
      const device = await getRuntimeDevice(deviceName);
      const sources = await inspectUsbImageSources(deviceName, device);
      sendJson(res, 200, {ok:true,sources,source:sources[0],job:publicUsbImageJob()});
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/usb-image/status") {
      sendJson(res, 200, {ok:true,job:publicUsbImageJob()});
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/usb-image/start") {
      if (usbImageJob.running) { sendJson(res,409,{ok:false,error:`A USB image is already being created for ${usbImageJob.device}.`}); return; }
      const body = JSON.parse((await readBody(req)) || "{}");
      const deviceName = String(body.device || "");
      const device = await getRuntimeDevice(deviceName);
      const sources = await inspectUsbImageSources(deviceName, device);
      const sourceId = String(body.sourceId || "remote");
      const source = sources.find(item => item.id === sourceId);
      if (!source) { sendJson(res,409,{ok:false,error:"That USB image source is no longer connected. Reopen USB Image and choose it again."}); return; }
      const requestedDestination = path.resolve(String(body.destination || ""));
      if (path.dirname(requestedDestination) !== path.resolve(usbImagesPath) || !/^.+\.img$/i.test(path.basename(requestedDestination))) {
        sendJson(res,400,{ok:false,error:"The USB image destination must be the preflight path inside Ready Player One's USB Images folder."});
        return;
      }
      source.destination = requestedDestination;
      if (source.availableBytes < source.diskSize) {
        sendJson(res,409,{ok:false,error:`Not enough PC storage. The image needs ${source.diskSize} bytes, but only ${source.availableBytes} bytes are free.`});
        return;
      }
      if (fs.existsSync(source.destination) || fs.existsSync(`${source.destination}.partial`)) {
        sendJson(res,409,{ok:false,error:"That USB image destination already exists. Reopen USB Image to generate a new name."});
        return;
      }
      if (source.type === "local") createLocalUsbImage(deviceName, source);
      else createUsbImage(deviceName, device, source);
      sendJson(res,202,{ok:true,job:publicUsbImageJob()});
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/usb-image/cancel") {
      if (!usbImageJob.running || !usbImageControl) { sendJson(res,409,{ok:false,error:"No USB image is currently running."}); return; }
      const body = JSON.parse((await readBody(req)) || "{}");
      if (body.device && body.device !== usbImageJob.device) { sendJson(res,409,{ok:false,error:`The active USB image belongs to ${usbImageJob.device}.`}); return; }
      usbImageControl.cancel();
      sendJson(res,200,{ok:true,job:publicUsbImageJob()});
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/keypad') {
      const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      let trusted = !req.headers.origin;
      try { if(req.headers.origin) {const origin=new URL(req.headers.origin); trusted=['localhost','127.0.0.1','[::1]'].includes(origin.hostname)&&origin.port===String(port);} } catch {}
      if(!local || !trusted || !String(req.headers['content-type']||'').startsWith('application/json')) {sendJson(res,403,{ok:false,error:'Open keypad setup from Ready Player One on this PC.'});return;}
      const captureAbort=new AbortController();
      res.once('close',()=>{if(!res.writableEnded)captureAbort.abort();});
      try {const result=await keypadAction(JSON.parse(await readBody(req)),captureAbort.signal);if(!res.destroyed)sendJson(res,200,result);}
      catch(error) {if(!res.destroyed)sendJson(res,400,{ok:false,error:error.message});}
      return;
    }
    if (['GET', 'POST'].includes(req.method) && url.pathname === '/api/windows/dual-boot/stage') {
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      let trustedOrigin = !req.headers.origin;
      if (req.headers.origin) {
        try { const origin = new URL(req.headers.origin); trustedOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) && origin.port === String(port); } catch {}
      }
      if (!local || !trustedOrigin) { sendJson(res, 403, {ok:false,error:'Open Shared Dual Boot from Ready Player One on this PC.'}); return; }
      if (req.method === 'GET') {
        const job = sharedDualBootStageJobs.get(url.searchParams.get('job'));
        sendJson(res, job ? 200 : 404, job ? {ok:true,job} : {ok:false,error:'Staging job not found.'});
        return;
      }
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) { sendJson(res, 400, {ok:false,error:'Expected a JSON staging request.'}); return; }
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        const machine = retroBatDiscovery.refresh()[body.device];
        if (machine?.platform !== 'windows' || !machine.online || machine.host !== body.host || !isAddressOnActiveLan(machine.host)) throw new Error('Choose a currently detected Windows machine running RP2.');
        const targetReport = JSON.parse(await fs.promises.readFile(`\\\\${machine.host}\\RP2Status\\preflight.json`,'utf8'));
        if (targetReport.ok !== true || typeof targetReport.computer !== 'string' || !targetReport.computer) throw new Error('RP2 did not provide a valid Windows computer identity.');
        try { await fs.promises.readdir(`\\\\${machine.host}\\RP2Stage`); }
        catch (error) { throw new Error(`The RP2Stage share is not available on ${machine.host}. Reinstalling RP2 alone does not create this share. On that Windows PC, open RP2, choose the home network and Windows account, click Configure All, and approve the administrator prompt. If setup fails, report its exact message. No image was sent or disk changed. (${error.code || 'network error'})`); }
        let existingState = null;
        try { existingState = JSON.parse(await fs.promises.readFile(`\\\\${machine.host}\\RP2Stage\\install-state.json`,'utf8')); }
        catch (error) { if (!['ENOENT','UNKNOWN'].includes(error.code)) throw error; }
        if (['resizing-windows','creating-partitions','copying-boot-files','awaiting-refind','installing-refind','awaiting-first-boot','complete'].includes(existingState?.phase)) throw new Error('Batocera preparation has already begun on this Windows PC. RP1 will not replace its staged plan.');
        if ([...sharedDualBootStageJobs.values()].some(job => job.host === machine.host && ['copying','verifying'].includes(job.phase))) throw new Error('An image is already being staged to this machine.');
        const jobId = crypto.randomUUID();
        const job = {id:jobId,host:machine.host,phase:'copying',copiedBytes:0,totalBytes:0,startedAt:new Date().toISOString()};
        sharedDualBootStageJobs.set(jobId,job);
        stageSharedDualBootImage({imagePath:body.imagePath,host:machine.host,targetComputerName:targetReport.computer,windowsGb:Number(body.windowsGb),defaultOs:body.defaultOs,onProgress:progress => Object.assign(job,progress)})
          .then(plan => { job.phase='staged'; job.plan=plan; job.finishedAt=new Date().toISOString(); })
          .catch(error => { job.phase='failed'; job.error=error.message; job.finishedAt=new Date().toISOString(); });
        sendJson(res,202,{ok:true,jobId});
      } catch (error) { sendJson(res,400,{ok:false,error:error.message}); }
      return;
    }
    if (['GET','POST'].includes(req.method) && url.pathname === '/api/windows/dual-boot/install') {
      const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      let trustedOrigin = !req.headers.origin;
      if (req.headers.origin) {
        try { const origin = new URL(req.headers.origin); trustedOrigin = ['localhost','127.0.0.1','[::1]'].includes(origin.hostname) && origin.port === String(port); } catch {}
      }
      if (!local || !trustedOrigin) { sendJson(res,403,{ok:false,error:'Open Shared Dual Boot from Ready Player One on this PC.'}); return; }
      try {
        const body = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : Object.fromEntries(url.searchParams);
        const machine = retroBatDiscovery.refresh()[body.device];
        if (machine?.platform !== 'windows' || !machine.online || machine.host !== body.host || !isAddressOnActiveLan(machine.host)) throw new Error('The selected Windows PC is not announcing RP2 on this LAN.');
        const stageRoot = `\\\\${machine.host}\\RP2Stage`;
        const readOptional = async name => {
          try { return JSON.parse(await fs.promises.readFile(path.win32.join(stageRoot,name),'utf8')); }
          catch (error) { if (['ENOENT','UNKNOWN'].includes(error.code)) return null; throw error; }
        };
        if (req.method === 'GET') {
          const result = await readOptional('install-result.json');
          const state = await readOptional('install-state.json');
          sendJson(res,200,{ok:true,result,state});
          return;
        }
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new Error('Expected a JSON install request.');
        if (body.backupConfirmed !== true || body.recoveryMediaConfirmed !== true) throw new Error('Confirm a verified backup and Windows recovery USB before installing dual boot.');
        const planPath = path.win32.join(stageRoot,'plan.json');
        const planBuffer = await fs.promises.readFile(planPath);
        if (planBuffer.length > 8192) throw new Error('The staged plan is unexpectedly large.');
        const plan = JSON.parse(planBuffer.toString('utf8'));
        if (plan.schema !== 1 || plan.status !== 'staged-only' || plan.refindName !== 'refind-bin-0.14.2.zip' || plan.refindSha256 !== '410c7828c4fec2f2179bd956073522415831d27c00416381b8f71153c190a311') throw new Error('This staged plan does not include the approved rEFInd package. Stage the image again from RP1.');
        const report = JSON.parse(await fs.promises.readFile(`\\\\${machine.host}\\RP2Status\\preflight.json`,'utf8'));
        let worker = null;
        try { worker = JSON.parse(await fs.promises.readFile(`\\\\${machine.host}\\RP2Status\\dual-boot-worker.json`,'utf8')); } catch {}
        const workerVersion = String(worker?.version || '');
        const workerMatch = /^1\.0\.(\d+)$/.exec(workerVersion);
        const workerCompatible = worker?.schema === 1 && workerMatch && Number(workerMatch[1]) >= 56 && worker.computer === report.computer;
        if (!workerCompatible) throw new Error('This Windows PC needs RP2 1.0.56 or newer. Run Configure All once in the updated RP2 before using Install Dual Boot.');
        if (plan.targetComputerName !== report.computer || Number(body.diskNumber) !== Number(report.diskNumber) || Number(body.windowsGb) !== Number(plan.windowsGb) || body.defaultOs !== plan.defaultOs) throw new Error('The selected Windows disk or dual-boot options changed since confirmation.');
        const existingInstallState = await readOptional('install-state.json');
        const repairableExistingInstall = ['awaiting-first-boot','complete'].includes(existingInstallState?.phase);
        if (existingInstallState && existingInstallState.phase !== 'failed' && !repairableExistingInstall) throw new Error('An install is already in progress on this Windows PC. RP1 will not start a second disk operation.');
        const requestPath = path.win32.join(stageRoot,'install-request.json');
        try { await fs.promises.stat(requestPath); throw new Error('An install request is already pending on this Windows PC.'); }
        catch (error) { if (!['ENOENT','UNKNOWN'].includes(error.code)) throw error; }
        const requestId = crypto.randomUUID();
        const request = {schema:1,action:'dual-boot-remote-install',requestId,targetComputerName:report.computer,planSha256:crypto.createHash('sha256').update(planBuffer).digest('hex'),diskNumber:report.diskNumber,windowsGb:plan.windowsGb,defaultOs:plan.defaultOs,backupConfirmed:true,recoveryMediaConfirmed:true,createdAt:new Date().toISOString()};
        const requestTemp = path.win32.join(stageRoot,`install-request.${requestId}.partial`);
        try {
          await fs.promises.writeFile(requestTemp,JSON.stringify(request,null,2),{flag:'wx'});
          await fs.promises.rename(requestTemp,requestPath);
        } finally { await fs.promises.rm(requestTemp,{force:true}).catch(() => {}); }
        sendJson(res,202,{ok:true,requestId});
      } catch (error) { sendJson(res,400,{ok:false,error:error.message}); }
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/windows/dual-boot/choose-image") {
      const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
      let trustedOrigin = !req.headers.origin;
      if (req.headers.origin) {
        try { const origin = new URL(req.headers.origin); trustedOrigin = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) && origin.port === String(port); } catch {}
      }
      if (!local || !trustedOrigin) {sendJson(res,403,{ok:false,error:'Choose the image from Ready Player One on this PC.'});return;}
      try {
        const selectedPath = await chooseSharedDualBootImage();
        sendJson(res,200,selectedPath ? {ok:true,cancelled:false,image:await inspectSharedDualBootImage(selectedPath)} : {ok:true,cancelled:true});
      } catch(error) {sendJson(res,400,{ok:false,error:error.message});}
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/windows/dual-boot/inspect-image") {
      const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
      let trustedOrigin = !req.headers.origin;
      if (req.headers.origin) {
        try { const origin = new URL(req.headers.origin); trustedOrigin = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) && origin.port === String(port); } catch {}
      }
      if (!local || !trustedOrigin || !String(req.headers['content-type'] || '').startsWith('application/json')) {sendJson(res,403,{ok:false,error:'Inspect the image from Ready Player One on this PC.'});return;}
      try { const body = JSON.parse((await readBody(req)) || '{}'); sendJson(res,200,{ok:true,image:await inspectSharedDualBootImage(body.path)}); }
      catch(error) {sendJson(res,400,{ok:false,error:error.message});}
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/windows/dual-boot/preflight") {
      const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
      if (!local) {sendJson(res,403,{ok:false,error:'Open Shared Dual Boot from Ready Player One on this PC.'});return;}
      const machine=retroBatDiscovery.refresh()[url.searchParams.get('device')];
      if(machine?.platform!=='windows'||!machine.online||!isAddressOnActiveLan(machine.host)) {sendJson(res,404,{ok:false,error:'The selected Windows machine is not currently announcing RP2 on this LAN.'});return;}
      try {
        const source=`\\\\${machine.host}\\RP2Status\\preflight.json`;
        const raw=await fs.promises.readFile(source,'utf8');
        if(raw.length>65536)throw new Error('The RP2 report is unexpectedly large.');
        const report=JSON.parse(raw);
        if(report?.ok!==true||!Number.isFinite(report.diskSizeBytes)||!Number.isFinite(report.windowsPartitionSizeBytes)||!Array.isArray(report.partitions))throw new Error('RP2 returned an invalid drive report.');
        let workerReady = false;
        let workerVersion = null;
        try {
          const worker = JSON.parse(await fs.promises.readFile(`\\\\${machine.host}\\RP2Status\\dual-boot-worker.json`,'utf8'));
          workerVersion = String(worker?.version || '');
          const workerMatch = /^1\.0\.(\d+)$/.exec(workerVersion);
          workerReady = worker?.schema === 1 && workerMatch && Number(workerMatch[1]) >= 56 && worker.computer === report.computer;
        } catch {}
        let installState = null;
        try {
          const stateRaw = await fs.promises.readFile(`\\\\${machine.host}\\RP2Stage\\install-state.json`,'utf8');
          if (stateRaw.length < 16384) {
            const parsed = JSON.parse(stateRaw);
            if (typeof parsed.phase === 'string') installState = {phase:parsed.phase,detail:String(parsed.detail || '').slice(0,500),updatedAt:parsed.updatedAt};
          }
        } catch {}
        let stagedPlan = null;
        try {
          const planRaw = await fs.promises.readFile(`\\\\${machine.host}\\RP2Stage\\plan.json`,'utf8');
          if (planRaw.length < 16384) {
            const parsed = JSON.parse(planRaw);
            if (parsed?.schema === 1 && parsed.status === 'staged-only' && parsed.targetComputerName === report.computer) {
              stagedPlan = {diskNumber:Number(parsed.diskNumber ?? report.diskNumber),windowsGb:Number(parsed.windowsGb),defaultOs:parsed.defaultOs};
            }
          }
        } catch {}
        const canFinishExisting = workerReady && ['awaiting-first-boot','complete'].includes(installState?.phase) && stagedPlan && Number.isFinite(stagedPlan.windowsGb) && ['windows','batocera'].includes(stagedPlan.defaultOs);
        sendJson(res,200,{ok:true,host:machine.host,report,installState,workerReady,workerVersion,stagedPlan,canFinishExisting:Boolean(canFinishExisting)});
      } catch(error) {sendJson(res,400,{ok:false,error:`Could not read RP2's drive report. Add / Update Credentials for this Windows machine, then run the updated RP2 setup. ${error.message}`});}
      return;
    }
    if (req.method === "POST" && ['/api/lakka/credentials/connect','/api/recalbox/credentials/connect','/api/retrobat/credentials/connect','/api/batocera/credentials/connect','/api/windows/credentials/connect'].includes(url.pathname)) {
      const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
      let trustedOrigin = !req.headers.origin;
      if (req.headers.origin) {
        try { const origin = new URL(req.headers.origin); trustedOrigin = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) && origin.port === String(port); } catch {}
      }
      if (!local || !trustedOrigin || !String(req.headers["content-type"] || "").startsWith("application/json")) {
        sendJson(res, 403, {ok:false, error:"Open credentials from Ready Player One on this PC."}); return;
      }
      if (process.platform !== "win32") { sendJson(res, 400, {ok:false, error:"Windows Credential Manager requires Windows."}); return; }
      const body=JSON.parse((await readBody(req)) || '{}');
      if(url.pathname==='/api/windows/credentials/connect') {
        try {
          const machine=retroBatDiscovery.refresh()[body.device];
          if(machine?.platform!=='windows'||machine.host!==body.host||!machine.online||!isAddressOnActiveLan(body.host))throw new Error('Choose a currently detected Windows machine running Ready Player Two.');
          const result=await require('./retrobat-credentials')({...body,platform:'windows'});
          sendJson(res,result.ok?200:400,result);
        } catch(error) {sendJson(res,400,{ok:false,error:error.message});}
        finally {body.password=null;}
        return;
      }
      if(['/api/lakka/credentials/connect','/api/recalbox/credentials/connect'].includes(url.pathname)){
        try{
          const sshPlatform=url.pathname.includes('recalbox')?'recalbox':'lakka';
          const sshLabel=sshPlatform==='recalbox'?'Recalbox':'Lakka';
          let known={};try{known=JSON.parse(fs.readFileSync(path.join(root,'retrobat-machines.json'),'utf8'));}catch{}
          const machine=known[body.device];
          if(machine?.platform!==sshPlatform||machine.host!==body.host||!isAddressOnActiveLan(body.host))throw new Error(`Choose a currently detected ${sshLabel} machine.`);
          if(typeof body.username!=='string'||!body.username.trim()||body.username.length>256||typeof body.password!=='string'||body.password.length>2560)throw new Error('Enter the SSH username and password.');
          const candidate={...machine,name:body.device,user:body.username.trim(),password:body.password,access:'ssh'};
          const romRoot=sshPlatform==='recalbox'?'/recalbox/share/roms':'/storage/roms';
          await execSsh(candidate,`test -d ${shellSingleQuoted(romRoot)}`,10000);
          await sftpWithDedicatedDeviceOnce(candidate,sftp=>new Promise((resolve,reject)=>sftp.readdir(romRoot,(e,rows)=>e?reject(e):resolve(rows))));
          let saved={};try{saved=JSON.parse(fs.readFileSync(lakkaCredentialsPath,'utf8'));}catch{}
          delete saved[body.device];
          if(body.remember===true)saved[body.device]={user:candidate.user,passwordProtected:require('./machine-secret')('Protect',body.password)};
          fs.writeFileSync(lakkaCredentialsPath,JSON.stringify(saved,null,2));
          lakkaSessions.set(body.device,{user:candidate.user,password:body.password});
          closeSftpSession(candidate.host);
          sendJson(res,200,{ok:true,remembered:body.remember===true});
        }catch(error){const sshLabel=url.pathname.includes('recalbox')?'Recalbox':'Lakka';sendJson(res,400,{ok:false,error:`${sshLabel} SSH connection failed: ${error.message}. Check SSH is enabled and the credentials are correct. File access also requires SFTP support.`});}
        finally{body.password=null;}
        return;
      }
      if(url.pathname==='/api/batocera/credentials/connect') {
        try {
          const device=devices[body.device];
          if(!device || typeof body.username!=='string' || !body.username.trim() || typeof body.password!=='string' || body.username.length>256 || body.password.length>2560) {sendJson(res,400,{ok:false,error:'Choose a Batocera machine and enter its username and password.'});return;}
          const host=device.discoveredHost||device.host;
          if(!host || host!==body.host) {sendJson(res,400,{ok:false,error:'The machine address changed. Reopen its credentials form.'});return;}
          const candidate={...device,host,user:body.username.trim(),password:body.password};
          try {await execSsh(candidate,'test -d /userdata/roms',10000);}
          catch {sendJson(res,400,{ok:false,error:'Could not log in to Batocera. Check its username, password, and SSH connection.'});return;}
          const settings=readDeviceSettings();
          const config={...(settings[body.device]||{})};
          delete config.sshUsername;delete config.sshPasswordProtected;
          if(body.remember===true) {config.sshUsername=candidate.user;config.sshPasswordProtected=require('./machine-secret')('Protect',body.password);}
          settings[body.device]=config;writeDeviceSettings(settings);
          device.user=candidate.user;device.password=body.password;
          verifiedOnlineUntil.set(body.device,Date.now()+90000);
          discoveryCache.at=0;
          sendJson(res,200,{ok:true,remembered:body.remember===true});
        } finally {body.password=null;}
        return;
      }
      let known={};
      try {known=JSON.parse(fs.readFileSync(path.join(root,'retrobat-machines.json'),'utf8'));} catch {}
      const registeredMachine=known[body.device];
      if (!registeredMachine || registeredMachine.host!==body.host) {sendJson(res,400,{ok:false,error:'Choose a detected EmulationStation machine.'});return;}
      if (registeredMachine.platform === 'windows') {sendJson(res,400,{ok:false,error:'This is a Windows machine running Ready Player Two, not RetroBat. Use its Windows Add / Update Credentials option.'});return;}
      // The server registry is authoritative. Do not trust or depend on a
      // cached browser card to choose the remote share.
      body.platform=registeredMachine.platform;
      try {
        const result=await require('./retrobat-credentials')(body);
        sendJson(res,result.ok?200:400,result);
      } finally {body.password=null;}
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/soft-reset") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured for soft reset." });
        return;
      }

      await runSoftReset(device);
      clearSoftResetNeeded(body.device);
      saveDiscoveredHost(body.device, device.host, "ssh");
      verifiedOnlineUntil.set(body.device, Date.now() + 90 * 1000);
      discoveryCache = {
        at: Date.now(),
        devices: {
          ...(discoveryCache.devices || {}),
          [body.device]: {
            host: device.host,
            configuredHost: devices[body.device].host,
            resolvedFrom: "successful soft reset",
            online: true,
            reachable: true,
            searching: false,
            access: "ssh",
            checks: { ping: true, ssh: true, smb: false, web: false },
            identity: "batocera",
            scanCandidates: lastScanCandidates
          }
        }
      };
      sendJson(res, 200, { ok: true, host: device.host, online: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/layout/check-sources") {
      const body = JSON.parse((await readBody(req)) || "{}");
      if (!Array.isArray(body.items)) {
        sendJson(res, 400, { ok: false, error: "Invalid source list." });
        return;
      }
      const missing = [];
      for (const item of body.items) {
        try { safeLocalRomPath(item.system, item.fileName); }
        catch { missing.push({ system: item.system, fileName: item.fileName }); }
      }
      sendJson(res, 200, { ok: true, missing });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/layout/open") {
      const selectedPath = await chooseTransferLayoutPath("open");
      if (!selectedPath) {
        sendJson(res, 200, { ok: true, cancelled: true });
        return;
      }
      const layout = JSON.parse(fs.readFileSync(selectedPath, "utf8").replace(/^\uFEFF/, ""));
      if (layout?.kind !== "rom-warehouse-transfer-layout" || !layout.systems || typeof layout.systems !== "object") {
        sendJson(res, 400, { ok: false, error: "This file is not a Ready Player One transfer layout." });
        return;
      }
      sendJson(res, 200, { ok: true, cancelled: false, layout });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/layout/choose-save-path") {
      const selectedPath = await chooseTransferLayoutPath();
      if (!selectedPath) {
        sendJson(res, 200, { ok: true, cancelled: true });
        return;
      }
      sendJson(res, 200, { ok: true, cancelled: false, path: selectedPath });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/layout/save-to-path") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const layout = body.layout;
      const selectedPath = String(body.path || "").trim();
      if (!selectedPath || layout?.kind !== "rom-warehouse-transfer-layout" || typeof layout.systems !== "object" || !layout.systems) {
        sendJson(res, 400, { ok: false, error: "The transfer layout data is invalid." });
        return;
      }
      fs.writeFileSync(selectedPath, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
      sendJson(res, 200, { ok: true, path: selectedPath });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/devices/status") {
      const mode = url.searchParams.get("mode") || "fast";
      if (mode === "fast" && fastDeviceStatusCache.devices && Date.now() - fastDeviceStatusCache.at < 15000) {
        sendJson(res, 200, { ok: true, devices: fastDeviceStatusCache.devices });
        return;
      }
      const retroBatStatuses = mode === "deep" ? await retroBatDiscovery.scan() : retroBatDiscovery.refresh();
      let statuses;
      if (mode === "deep") {
        statuses = await getDeviceStatuses({ deep: true, background: false });
      } else {
        // Card polling must stay responsive even while a full subnet scan,
        // hostname lookup, or transfer batch is busy. Verify each saved SSH
        // address directly and let the comprehensive discovery update the
        // cache in the background.
        const neighbors = await arpEntries();
        const quickEntries = await Promise.all(Object.entries(devices).map(async ([name, device]) => {
          const savedMac = String(device.mac || "").toLowerCase();
          const macHost = savedMac
            ? neighbors.find(entry => entry.mac === savedMac && isAddressOnActiveLan(entry.host))?.host || ""
            : "";
          const host = macHost || device.discoveredHost || device.host || "";
          // Half a second is too short while Batocera is copying, scraping, or
          // restarting EmulationStation. A delayed banner is not a disconnect.
          const ssh = Boolean(host) && await isTcpPortOpen(host, 22, 1200);
          const batoceraSsh = ssh && /dropbear/i.test(await sshServerBanner(host, 1200));
          const cached = discoveryCache.devices?.[name] || {};
          const cachedOnline = Boolean(cached.online) && cached.host === host
            && Date.now() - discoveryCache.at < 15000;
          const online = batoceraSsh && device.discoveredAccess === "ssh";
          if (online && macHost && macHost !== device.discoveredHost) {
            saveDiscoveredHost(name, macHost, "ssh", savedMac);
          }
          return [name, {
            ...cached,
            host: online ? host : (cached.host || host),
            configuredHost: device.host,
            resolvedFrom: online ? "saved Batocera SSH connection" : (cached.resolvedFrom || "background discovery"),
            online: online || cachedOnline,
            reachable: ssh || (cachedOnline && Boolean(cached.reachable)),
            searching: !(online || cachedOnline) && Boolean(deepDiscoveryPromise),
            access: online ? "ssh" : (cachedOnline ? cached.access || "" : ""),
            checks: { ...(cached.checks || {}), ssh },
            identity: online ? "batocera" : (cached.identity || "")
          }];
        }));
        statuses = Object.fromEntries(quickEntries);
        // Keep card polling quick, but recover automatically when DHCP gives a
        // saved machine another address. Discovery is asynchronous and updates
        // the persisted host by MAC after Batocera identity is verified.
        if (quickEntries.some(([, status]) => !status.online)) {
          startAutomaticRediscovery();
        }
      }
      // The frequent card-status poll must never wait on Windows CIM/USB
      // enumeration. A slow removable drive used to hold the whole response,
      // leaving live network machines red and hiding RetroBat until the scan
      // eventually returned. Deep scans may await fresh USB data; fast polls
      // return the accessible cache and refresh it in the background.
      const usbDevices = mode === "deep"
        ? await detectBatoceraUsbDevices({ fresh: true })
        : accessibleCachedUsbDevices();
      if (mode !== "deep") detectBatoceraUsbDevices({ fresh: true }).catch(() => {});
      const usbStatuses = Object.fromEntries(usbDevices.map(device => [device.name, {
        host: device.drive,
        configuredHost: device.drive,
        resolvedFrom: device.usbMode === "direct" ? "USB userdata" : "USB boot staging",
        online: true,
        reachable: true,
        searching: false,
        access: "usb",
        checks: { usb: true },
        identity: "batocera-usb",
        platform: "batocera-usb",
        usb: true,
        usbMode: device.usbMode,
        label: device.label,
        fileSystem: device.fileSystem,
        instanceId: `batocera-usb:${device.drive}:${device.label}:${device.physicalSize || device.size || 0}`
      }]));
      const retroBatHosts = new Set(Object.values(retroBatStatuses).map(item => item.host));
      // Do not resurrect a generic Batocera slot while platform discovery runs.
      // Only a current Batocera identity can override a known other platform.
      let knownPlatforms={};try{knownPlatforms=JSON.parse(fs.readFileSync(path.join(root,'retrobat-machines.json'),'utf8'));}catch{}
      const otherHosts=new Set(Object.values(knownPlatforms).map(m=>m.host));
      const batoceraStatuses = Object.fromEntries(Object.entries(statuses).filter(([,item]) => !retroBatHosts.has(item.host)&&(!otherHosts.has(item.host)||item.identity==='batocera')));
      const namedBatoceraStatuses = mode === "deep"
        ? await refreshMachineDisplayNames(batoceraStatuses)
        : Object.fromEntries(Object.entries(batoceraStatuses).map(([id, status]) => {
            const settings = readDeviceSettings();
            const displayName = savedMachineDisplayName(settings[id], id);
            return [id, {
              ...status,
              displayName,
              osVersion: String(settings[id]?.osVersion || ""),
              hostName: displayName,
              mac: String(devices[id]?.mac || settings[id]?.mac || "").toLowerCase(),
              instanceId: settings[id]?.installationId && settings[id]?.installationDisplayName === displayName
                ? `batocera-installation:${settings[id].installationId}`
                : `batocera-provisional:${status.mac || status.host || id}:${displayName}`
            }];
          }));
      if (mode === "fast" && Object.values(batoceraStatuses).some(status => status.online && status.access === "ssh")) {
        // Keep status polling fast, but still reconcile saved labels with the
        // connected installation. The next poll picks up any verified rename.
        setImmediate(() => refreshMachineDisplayNames({ ...batoceraStatuses })
          .then(() => { fastDeviceStatusCache.at = 0; })
          .catch(() => {}));
      }
      const deviceStatuses = { ...namedBatoceraStatuses, ...retroBatStatuses, ...usbStatuses };
      if (mode === "fast") fastDeviceStatusCache = { at: Date.now(), devices: deviceStatuses };
      sendJson(res, 200, { ok: true, devices: deviceStatuses });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/devices/removable") {
      const batoceraStatuses = discoveryCache.devices || {};
      const platformStatuses = retroBatDiscovery.refresh();
      const deviceSettings = readDeviceSettings();
      const platformSettings = retroBatDiscovery.known();
      const saved = {
        ...Object.fromEntries(Object.keys(deviceSettings).filter(id => devices[id]).map(id => [id, {
          platform: "batocera", host: deviceSettings[id]?.discoveredHost || deviceSettings[id]?.host || "",
          displayName: deviceSettings[id]?.machineDisplayName || id
        }])),
        ...Object.fromEntries(Object.entries(platformSettings).map(([id, machine]) => [id, machine]))
      };
      const machines = Object.entries(saved).map(([id, machine]) => {
        const status = platformStatuses[id] || batoceraStatuses[id] || {};
        const confirmedReachable = Boolean(status.online || (status.reachable &&
          (status.identity || status.checks?.ssh || status.checking)));
        const searching = Boolean(status.searching);
        return {
          id,
          displayName: status.displayName || machine.displayName || id,
          host: status.host || machine.host || "",
          platform: machine.platform || status.platform || "batocera",
          online: Boolean(status.online),
          searching,
          removable: !status.online && !confirmedReachable && !searching
        };
      });
      sendJson(res, 200, {ok:true, machines});
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/devices/remove") {
      const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
      if (!local || !String(req.headers["content-type"] || "").startsWith("application/json")) {
        sendJson(res, 403, {ok:false, error:"Remove machines from Ready Player One on this PC."});
        return;
      }
      const body = JSON.parse((await readBody(req)) || "{}");
      const id = typeof body.device === "string" ? body.device : "";
      const deviceSettings = readDeviceSettings();
      const platformSettings = retroBatDiscovery.known();
      const savedBatocera = Object.prototype.hasOwnProperty.call(deviceSettings, id) && Boolean(devices[id]);
      const savedPlatform = Object.prototype.hasOwnProperty.call(platformSettings, id);
      if (!savedBatocera && !savedPlatform) {
        sendJson(res, 404, {ok:false, error:"That saved machine was not found."});
        return;
      }
      // Recheck only the requested saved address. A full subnet scan here can
      // take a long time and is unrelated to whether this red card is safe to remove.
      const saved = savedBatocera ? deviceSettings[id] : platformSettings[id];
      const host = saved?.discoveredHost || saved?.host || "";
      let connected = false;
      if (host && isAddressOnActiveLan(host)) {
        if (savedBatocera) {
          const probe = await probeHost(host, {identify:true});
          connected = Boolean(probe.access === "ssh" || probe.access === "smb" || hasBatoceraIdentity(probe.identity));
        } else {
          const platformStatuses = retroBatDiscovery.refresh();
          const exactStatus = platformStatuses[id];
          const otherPlatformAtHost = Object.entries(platformStatuses).some(([otherId,status]) =>
            otherId !== id && status.host === host && status.online && status.platform !== saved?.platform);
          if (exactStatus?.online) connected = true;
          else if (!otherPlatformAtHost) {
            const ports = saved?.platform === "lakka" ? [22,445] : [445,22];
            connected = (await Promise.all(ports.map(number => isTcpPortOpen(host,number,900)))).some(Boolean);
          }
        }
      }
      if (connected) {
        sendJson(res, 409, {ok:false, error:"This machine is connected or being checked. It can only be removed while its status light is red."});
        return;
      }
      if (savedBatocera) {
        delete deviceSettings[id];
        writeDeviceSettings(deviceSettings);
        delete devices[id];
      }
      if (savedPlatform) retroBatDiscovery.remove(id);
      if (platformSettings[id]?.platform === "lakka") {
        const credentials = (() => { try { return JSON.parse(fs.readFileSync(lakkaCredentialsPath,"utf8")); } catch { return {}; } })();
        delete credentials[id];
        fs.writeFileSync(lakkaCredentialsPath, JSON.stringify(credentials,null,2));
        lakkaSessions.delete(id);
      }
      verifiedOnlineUntil.delete(id);
      machineNameChecks.delete(id);
      if (discoveryCache.devices) delete discoveryCache.devices[id];
      discoveryCache.at = 0;
      sendJson(res, 200, {ok:true, removed:id});
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/usb-library-reader/status") {
      const usbDevices = await detectBatoceraUsbDevices({ fresh: true });
      const deviceName = url.searchParams.get("device") || "";
      const device = usbDevices.find(item => item.name === deviceName);
      if (!device) {
        sendJson(res, 404, { ok: false, installed: false, error: "Select a connected BATOCERA USB card first." });
        return;
      }
      sendJson(res, 200, { ok: true, installed: usbLibraryReaderInstalled(device), drive: device.drive });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/usb-library-reader/install") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const usbDevices = await detectBatoceraUsbDevices({ fresh: true });
      const device = usbDevices.find(item => item.name === body.device);
      if (!device) {
        sendJson(res, 404, { ok: false, installed: false, error: "Select a connected BATOCERA USB card first." });
        return;
      }
      if (device.usbMode !== "staged") {
        sendJson(res, 400, { ok: false, installed: false, error: "This USB userdata is already directly readable; the reader is not needed." });
        return;
      }
      installUsbImportScript(device);
      const installed = usbLibraryReaderInstalled(device);
      sendJson(res, installed ? 200 : 500, {
        ok: installed,
        installed,
        drive: device.drive,
        error: installed ? undefined : "The USB Library Reader could not be verified."
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/devices/add") {
      let index = 1;
      let name = "Batocera";
      while (devices[name]) { index += 1; name = `Batocera ${index}`; }
      devices[name] = newBatoceraDevice("");
      const settings = readDeviceSettings();
      settings[name] = { host: "", discoveredHost: "", platform: "batocera", savedAt: new Date().toISOString() };
      writeDeviceSettings(settings);
      discoveryCache = { at: 0, devices: null };
      sendJson(res, 200, { ok: true, device: name, host: "" });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/devices/rescan") {
      discoveryCache = { at: 0, devices: null };
      startDeepDiscovery({ full: true });
      retroBatDiscovery.scan().catch(error => console.error('Multi-platform discovery failed:', error));
      sendJson(res, 202, { ok: true, scanning: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/active") {
      const device = await getRuntimeDevice(url.searchParams.get("device") || "Batocera", { skipConnectionProbe: true });
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }

      const system = url.searchParams.get("system") || "mame";
      let items;
      try {
        items = await listRemoteRoms(device, system);
      } catch (error) {
        const machineId=url.searchParams.get('device') || 'Batocera';
        const reachable=device.access==='usb' || await isTcpPortOpen(device.host,device.access==='smb'?445:22,2000);
        // A library/authentication error is not proof of a disconnected machine.
        if (!reachable && device.access !== 'usb') invalidateMachineConnection(machineId);
        sendJson(res, 503, { ok: false, reconnecting: !reachable, error: reachable
          ? 'Machine is reachable, but its library could not be read. Check its credentials or SSH service.'
          : 'Connection interrupted. Rediscovering this machine and retrying its library.' });
        return;
      }
      const deletion = device.access === 'usb' && device.usbMode === 'staged'
        ? deletionState(device.driveRoot,systemFolders[system] || system) : null;
      const machineId = url.searchParams.get('device') || 'Batocera';
      sendJson(res, 200, {
        ok: true,
        items,
        pendingResetGames: softResetPendingGames(machineId, system),
        pendingDeletions: deletion?.pending || 0,
        deletionErrors: deletion?.errors || []
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/device/systems") {
      const device = await getRuntimeDevice(url.searchParams.get("device"));
      if (!device) { sendJson(res, 404, {ok:false, error:"Machine not found."}); return; }
      const systems = [];
      if (['lakka','recalbox'].includes(device.platform)) {
        systems.push(...await listLakkaSystems(device));
      } else if (device.access === "ssh") {
        const output = await execSsh(device, "curl --max-time 10 -fsS http://127.0.0.1:1234/systems", 15000);
        const listed = JSON.parse(output);
        if (!Array.isArray(listed)) throw new Error("Cannot read this machine's systems yet.");
        const names = new Set(listed.map(item => item.name));
        // Steam can be installed before its first game shortcut is created.
        if (!names.has('steam') && (!device.platform || device.platform === 'batocera')) {
          const steam = await execSsh(device, "if flatpak info --system com.valvesoftware.Steam >/dev/null 2>&1 || su - batocera -c 'flatpak info --user com.valvesoftware.Steam' >/dev/null 2>&1 || [ -f /userdata/roms/flatpak/steam.flatpak ] || find /userdata/roms/steam -maxdepth 1 -type f -name '*.steam' -print -quit 2>/dev/null | grep -q .; then printf steam; fi", 15000);
          if (String(steam).trim() === 'steam') names.add('steam');
        }
        for (const [key, folder] of Object.entries(systemFolders)) if (names.has(folder)) systems.push(key);
      } else {
        for (const key of Object.keys(systemFolders)) {
          if ((await listRemoteRoms(device, key)).length) systems.push(key);
        }
      }
      sendJson(res, 200, {ok:true, systems, supportedSystems:Object.keys(systemFolders)});
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/device/storage") {
      const device = await getRuntimeDevice(url.searchParams.get("device") || "Batocera");
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }

      const storage = await getDeviceStorage(device);
      sendJson(res, 200, { ok: true, storage });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/transfers/preflight") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }
      const size = localTransferSize(body.system, body.fileName);
      const freeBytes = Number(device.freeSpace || 0);
      const fat32Maximum = 4 * 1024 * 1024 * 1024 - 1;
      const stagedUsb = device.access === "usb" && device.usbMode === "staged";
      const exceedsFreeSpace = stagedUsb && size.totalBytes > freeBytes;
      const exceedsFileLimit = stagedUsb && size.largestFileBytes > fat32Maximum;
      sendJson(res, 200, {
        ok: true,
        allowed: !exceedsFreeSpace && !exceedsFileLimit,
        stagedUsb,
        freeBytes,
        ...size,
        exceedsFreeSpace,
        exceedsFileLimit
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/xbox-bios/install-cached") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      if (!device || device.access !== 'ssh') throw new Error('Select a live machine with SSH available.');
      const files = Object.entries(xboxBiosInstallers).map(([key, installer]) => {
        const fileName = installer.fileName || key;
        const localPath = path.join(biosCachePath, fileName);
        if (!fs.existsSync(localPath)) throw new Error(`Missing cached ${fileName}. Add it using Xbox BIOS Install first.`);
        const data = fs.readFileSync(localPath);
        if (crypto.createHash('md5').update(data).digest('hex') !== installer.md5) throw new Error(`${fileName} failed verification.`);
        return {fileName, data};
      });
      await sftpWithDevice(device, async (sftp, client) => {
        for (const {fileName, data} of files) {
          const destination = `/userdata/bios/${fileName}`;
          await writeSftpFile(sftp, destination, data);
          const saved = await new Promise((resolve, reject) => sftp.readFile(destination, (error, bytes) => error ? reject(error) : resolve(bytes)));
          if (!data.equals(saved)) throw new Error(`${fileName} failed installed verification.`);
        }
      });
      sendJson(res, 200, {ok: true, verified: true});
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/xbox-bios/install") {
      const device = await getRuntimeDevice(url.searchParams.get("device") || "Batocera");
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }
      const installed = await installXboxBios(req, device, url.searchParams.get("fileName"));
      sendJson(res, 200, { ok: true, ...installed });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/xbox360-xenia/status") {
      const device = await getRuntimeDevice(url.searchParams.get("device") || "Batocera");
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }
      const status = await getXbox360XeniaStatus(device);
      sendJson(res, 200, { ok: true, ...status });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/xbox360-xenia/setup") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device || "Batocera");
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }
      const result = await getXbox360XeniaStatus(device);
      if (!result.xenia) { sendJson(res, 400, {ok:false,error:"Xenia is missing from this Batocera build. RP1 did not install Wine or create a Wine prefix."}); return; }
      sendJson(res, 200, { ok: true, ...result, note:"Xenia is supplied by Batocera. RP1 made no Wine changes." });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/xbox360-xenia/storage") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device || "Batocera");
      if (!device) { sendJson(res, 404, {ok:false,error:"Device is not configured."}); return; }
      const storage = await prepareXbox360RuntimeStorage(device);
      const status = await getXbox360XeniaStatus(device);
      sendJson(res, 200, {ok:true, ...storage, status});
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/xenia-profile/open") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device || "Batocera");
      if (!device) { sendJson(res, 404, {ok:false, error:"Machine is not configured."}); return; }
      const result = await openXbox360XeniaProfile(device);
      sendJson(res, 200, {ok:true, ...result});
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/windows-wine/status") {
      const device = await getRuntimeDevice(url.searchParams.get("device") || "Batocera");
      if (!device) { sendJson(res, 404, {ok:false, error:"Device is not configured."}); return; }
      sendJson(res, 200, {ok:true, ...await getWindowsWineStatus(device)});
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/windows-wine/setup") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device || "Batocera");
      if (!device) { sendJson(res, 404, {ok:false, error:"Device is not configured."}); return; }
      sendJson(res, 200, {ok:true, ...await setupWindowsWine(device)});
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/library") {
      sendJson(res, 200, { ok: true, library: cachedLocalLibrary() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/machine-behavior") {
      const deviceName = url.searchParams.get("device") || "Batocera";
      const device = await getRuntimeDevice(deviceName, { skipConnectionProbe: true });
      if (!device) { sendJson(res, 404, { ok: false, error: "Machine is not configured." }); return; }
      sendJson(res, 200, { ok: true, device: deviceName, displayName: device.displayName || deviceName, online: Boolean(device.host), ...await getMachineBehavior(device) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/machine-behavior") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const deviceName = String(body.device || "Batocera");
      const device = await getRuntimeDevice(deviceName);
      if (!device) { sendJson(res, 404, { ok: false, error: "Machine is not configured." }); return; }
      sendJson(res, 200, { ok: true, device: deviceName, ...await applyMachineBehavior(deviceName, device, body, Boolean(body.restore)) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/machine-display") {
      const deviceName = url.searchParams.get("device") || "Batocera";
      const device = await getRuntimeDevice(deviceName, { skipConnectionProbe: true });
      if (!device) { sendJson(res, 404, {ok:false, error:"Machine is not configured."}); return; }
      sendJson(res, 200, {ok:true, device:deviceName, ...await getMachineDisplay(device)});
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/machine-display") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const deviceName = body.device || "Batocera";
      const device = await getRuntimeDevice(deviceName);
      if (!device) { sendJson(res, 404, {ok:false, error:"Machine is not configured."}); return; }
      sendJson(res, 200, {ok:true, device:deviceName, ...await setMachineDisplay(device, body)});
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/wiiu-keys/install") {
      const device = await getRuntimeDevice(url.searchParams.get("device") || "Batocera");
      if (!device || device.access !== "ssh") {
        sendJson(res, 409, { ok: false, error: "Wii U keys require a live Batocera machine with SSH access." });
        return;
      }
      const content = (await readBody(req)).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
      const lines = content.split("\n");
      const invalidLines = [];
      const keys = new Set();
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const match = trimmed.match(/^([0-9a-f]{32})(?:\s*(?:=|#).*)?$/i);
        if (match) keys.add(match[1].toLowerCase());
        else invalidLines.push(index + 1);
      });
      if (!keys.size || invalidLines.length) {
        const detail = invalidLines.length ? ` Invalid line${invalidLines.length === 1 ? "" : "s"}: ${invalidLines.slice(0, 8).join(", ")}.` : "";
        sendJson(res, 400, { ok: false, error: `keys.txt does not have a valid Cemu key structure.${detail}` });
        return;
      }
      await sftpWithDevice(device, async (sftp, client) => {
        await execOnSshClient(client, "mkdir -p /userdata/bios/cemu && chmod 700 /userdata/bios/cemu");
        await writeSftpFile(sftp, "/userdata/bios/cemu/keys.txt", `${content}\n`);
        await execOnSshClient(client, "chmod 600 /userdata/bios/cemu/keys.txt && sync");
      });
      const cemuSupport = await installWiiUCemuSupport(device);
      const cacheDir = path.join(biosCachePath, "cemu");
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, "keys.txt"), `${content}\n`, { encoding: "utf8", mode: 0o600 });
      sendJson(res, 200, { ok: true, keyCount: keys.size, installed: "/userdata/bios/cemu/keys.txt", cemuSupport });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/wiiu-keys/cache-status") {
      const cachedPath = path.join(biosCachePath, "cemu", "keys.txt");
      let keyCount = 0;
      try {
        const content = fs.readFileSync(cachedPath, "utf8");
        const keys = new Set();
        content.split(/\r?\n/).forEach(line => {
          const match = line.trim().match(/^([0-9a-f]{32})(?:\s*(?:=|#).*)?$/i);
          if (match) keys.add(match[1].toLowerCase());
        });
        keyCount = keys.size;
      } catch {}
      sendJson(res, 200, { ok: true, cached: keyCount > 0, keyCount });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/wiiu-keys/install-cached") {
      const device = await getRuntimeDevice(url.searchParams.get("device") || "Batocera");
      if (!device || device.access !== "ssh") {
        sendJson(res, 409, { ok: false, error: "Wii U keys require a live Batocera machine with SSH access." });
        return;
      }
      const cachedPath = path.join(biosCachePath, "cemu", "keys.txt");
      let content = "";
      try { content = fs.readFileSync(cachedPath, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim(); } catch {}
      const keys = new Set();
      const invalidLines = [];
      content.split("\n").forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const match = trimmed.match(/^([0-9a-f]{32})(?:\s*(?:=|#).*)?$/i);
        if (match) keys.add(match[1].toLowerCase());
        else invalidLines.push(index + 1);
      });
      if (!keys.size || invalidLines.length) {
        sendJson(res, 400, { ok: false, error: "The cached Cemu keys.txt is missing or invalid." });
        return;
      }
      await sftpWithDevice(device, async (sftp, client) => {
        await execOnSshClient(client, "mkdir -p /userdata/bios/cemu && chmod 700 /userdata/bios/cemu");
        await writeSftpFile(sftp, "/userdata/bios/cemu/keys.txt", `${content}\n`);
        await execOnSshClient(client, "chmod 600 /userdata/bios/cemu/keys.txt && sync");
      });
      const cemuSupport = await installWiiUCemuSupport(device);
      sendJson(res, 200, { ok: true, keyCount: keys.size, installed: "/userdata/bios/cemu/keys.txt", cached: true, cemuSupport });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/library/sizes") {
      const system = url.searchParams.get("system") || "mame";
      sendJson(res, 200, { ok: true, system, ...await listLocalLibrarySizesAsync(system) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/retrobat/setup') {
      const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      let trustedOrigin=!req.headers.origin;
      if(req.headers.origin){try{const origin=new URL(req.headers.origin);trustedOrigin=['localhost','127.0.0.1','[::1]'].includes(origin.hostname)&&origin.port===String(port);}catch{}}
      if(!local||!trustedOrigin||!String(req.headers['content-type']||'').startsWith('application/json')){sendJson(res,403,{ok:false,error:'Start setup from Ready Player One on this PC.'});return;}
      const body=JSON.parse((await readBody(req))||'{}');
      const device=await getRuntimeDevice(body.device);
      if(device?.platform!=='retrobat')throw new Error('Choose a detected RetroBat machine.');
      const setup=require('./retrobat-setup')({cache:biosCachePath,ps1:ps1BiosByMd5,large:largeBiosInstallers,xbox:xboxBiosInstallers});
      sendJson(res,200,await setup.install(`\\\\${device.host}\\RetroBat`,body.system));return;
    }
    if (req.method === 'GET' && url.pathname === '/api/system-setup/status') {
      const device = await getRuntimeDevice(url.searchParams.get('device'));
      if(['lakka','retroarch'].includes(device?.platform))throw new Error('This machine is detected, but automatic BIOS/core setup for this platform is not yet available. No Batocera or RetroBat installer will be run.');
      if(device?.platform==='retrobat'){
        const setup=require('./retrobat-setup')({cache:biosCachePath,ps1:ps1BiosByMd5,large:largeBiosInstallers,xbox:xboxBiosInstallers});
        sendJson(res,200,{ok:true,platform:'retrobat',...await setup.plan(`\\\\${device.host}\\RetroBat`)});return;
      }
      if (!device || device.access !== 'ssh') throw new Error('Cannot verify setup: live SSH required.');
      const systems = {};
      await sftpWithDevice(device, async (sftp, client) => {
        const matches = async (remote, hashes) => {
          const stat = await statSftpOptional(sftp, remote);
          if (!stat) return false;
          const output = await execSsh(device, `md5sum ${shellSingleQuoted(remote)}`, 60000);
          return hashes.includes(output.trim().split(/\s+/)[0]);
        };
        systems.ps1 = false;
        for (const name of new Set(Object.values(ps1BiosByMd5))) {
          if (await matches(`/userdata/bios/${name}`, Object.keys(ps1BiosByMd5))) { systems.ps1 = true; break; }
        }
        for (const system of ['ps2', 'ps3']) {
          const installer = largeBiosInstallers[system];
          systems[system] = await matches(`${installer.remoteDir}/${installer.fileName}`, installer.acceptedMd5 || [installer.md5]);
        }
        systems.ps4 = await ps4ModulesInstalled(sftp) && (await getPs4SystemStatus(device)).installed;
        systems.xbox = true;
        for (const [name, installer] of Object.entries(xboxBiosInstallers)) {
          if (!await matches(`/userdata/bios/${installer.fileName || name}`, [installer.md5])) systems.xbox = false;
        }
        const keys = await statSftpOptional(sftp, '/userdata/bios/cemu/keys.txt');
        systems.wiiu = Boolean(keys?.size);
        const localKeys = path.join(biosCachePath, 'cemu', 'keys.txt');
        if (systems.wiiu && fs.existsSync(localKeys)) {
          systems.wiiu = await matches('/userdata/bios/cemu/keys.txt', [crypto.createHash('md5').update(fs.readFileSync(localKeys)).digest('hex')]);
        }
        if (systems.wiiu) systems.wiiu = await wiiUCemuSupportInstalled(sftp, client);
      });
      systems.karaoke = (await getKaraokeStatus(device)).installed;
      systems.pikaraoke = (await getPiKaraokeStatus(device)).installed;
      systems.xbox360 = (await getXbox360XeniaStatus(device)).installed;
      systems.windows = (await getWindowsWineStatus(device)).installed;
      systems['3dsen'] = (await execSsh(device, "test -L /userdata/roms/3dsen && grep -Fq '<name>3dsen</name>' /userdata/system/configs/emulationstation/es_systems.cfg && test -s /userdata/system/ready-player-one/3dsen-runtime/3dSen.pc/autorun.cmd && echo yes || echo no")).trim() === 'yes';
      sendJson(res, 200, {ok:true, systems});
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/3dsen/setup") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      const windowsWine = await getWindowsWineStatus(device);
      if (!windowsWine.installed) {
        throw new Error("3D NEC requires Wine. Select and apply Windows (Wine) first; RP1 will not install Wine automatically for another console.");
      }
      const runtime = await install3dSenWineRuntime(device);
      await ensure3dSenSystem(device);
      await runSoftReset(device);
      clearSoftResetNeeded(body.device);
      saveDiscoveredHost(body.device, device.host, "ssh");
      verifiedOnlineUntil.set(body.device, Date.now() + 90 * 1000);
      discoveryCache = { at: 0, devices: null };
      let visible = false;
      for (let attempt = 0; attempt < 20 && !visible; attempt += 1) {
        if (attempt) await wait(1000);
        try {
          const publishedSystems = JSON.parse(await execSsh(device, "curl --max-time 3 -fsS http://127.0.0.1:1234/systems", 8000));
          visible = Array.isArray(publishedSystems) && publishedSystems.some(system => system?.name === "3dsen");
        } catch {
          // EmulationStation's local API is temporarily unavailable while the
          // full interface refresh is still starting it again.
        }
      }
      if (!visible) throw new Error("3dSen was installed, but Batocera did not publish the console after its interface refresh.");
      sendJson(res, 200, { ok: true, installed: true, runtime, standaloneConsole: true, refreshed: true, visible: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/bios-warning/configure") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      if (!device || (device.platform && device.platform !== "batocera") || device.access !== "ssh") {
        throw new Error("Select a connected Batocera machine with SSH access.");
      }
      sendJson(res, 200, { ok: true, ...await disableGenericBiosLaunchWarning(device) });
      return;
    }

    if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/api/pygame-ce') {
      const device = await getRuntimeDevice(url.searchParams.get('device'));
      if (!device || device.access !== 'ssh') throw new Error('Select a live Batocera machine with SSH access.');
      const runtime = '/userdata/system/pygame-ce';
      const check = `${runtime}/venv/bin/python -c 'import pygame; assert getattr(pygame, "IS_CE", False); print("CE_VERSION=" + pygame.version.ver)'`;
      let version = '';
      try { version = (await execSsh(device, check)).match(/CE_VERSION=([^\r\n]+)/)?.[1] || ''; } catch {}
      if (req.method === 'POST' && !version) {
        const command = `set -e
mkdir -p ${runtime}
python3 -m venv --without-pip ${runtime}/venv
if ! ${runtime}/venv/bin/python -m pip --version >/dev/null 2>&1; then
  curl --connect-timeout 15 --max-time 120 --retry 2 -fL https://bootstrap.pypa.io/get-pip.py -o ${runtime}/get-pip.py
  ${runtime}/venv/bin/python ${runtime}/get-pip.py
fi
${runtime}/venv/bin/python -m pip install --only-binary=:all: pygame-ce
${check}
`;
        const output = await execSsh(device, command, 300000);
        version = output.match(/CE_VERSION=([^\r\n]+)/)?.[1] || '';
        if (!version) throw new Error('Pygame CE installation could not be verified.');
      }
      sendJson(res, 200, {ok:true, installed:Boolean(version), version, python:`${runtime}/venv/bin/python`});
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/usb-controller/install') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const device = await getRuntimeDevice(body.device);
      const installed = await installUsbController(device);
      sendJson(res, 200, {ok:true, ...installed});
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/karaoke/status") {
      const device = await getRuntimeDevice(url.searchParams.get("device") || "Batocera");
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }

      const status = await getKaraokeStatus(device);
      sendJson(res, 200, { ok: true, ...status });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/karaoke/install") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }

      const status = await installKaraoke(device);
      sendJson(res, 200, { ok: true, ...status });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/pikaraoke/status") {
      const device = await getRuntimeDevice(url.searchParams.get("device"));
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }
      sendJson(res, 200, { ok: true, ...await getPiKaraokeStatus(device) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/pikaraoke/setup") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }
      sendJson(res, 200, { ok: true, ...await installPiKaraoke(device) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ps1-bios/install") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }

      const installed = await installPs1Bios(device, body.data);
      sendJson(res, 200, { ok: true, ...installed });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/installed-features") {
      const extensionRoot = path.join(root, "extensions");
      const features = [];
      if (fs.existsSync(extensionRoot)) {
        for (const entry of fs.readdirSync(extensionRoot, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const manifestPath = path.join(extensionRoot, entry.name, "manifest.json");
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            if (manifest && typeof manifest.name === "string") features.push({
              id: String(manifest.id || entry.name),
              name: manifest.name,
              installedAt: String(manifest.installedAt || ""),
              items: Array.isArray(manifest.items) ? manifest.items.map(String) : []
            });
          } catch {}
        }
      }
      sendJson(res, 200, { ok: true, features });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/companion/open-downloads") {
      const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
      if (!local) { sendJson(res, 403, { ok: false, error: "Open Downloads from Ready Player One on this PC." }); return; }
      const downloads = path.join(os.homedir(), "Downloads");
      fs.mkdirSync(downloads, { recursive: true });
      execFile("explorer.exe", [downloads], error => {
        if (error) console.error("Could not open Downloads:", error.message);
      });
      sendJson(res, 200, { ok: true, path: downloads });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/program-topology/open") {
      const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
      if (!local) { sendJson(res, 403, { ok: false, error: "Open Program Topology from Ready Player One on this PC." }); return; }
      const documentPath = path.join(root, "output", "pdf", "ready-player-one-program-topology-v4.pdf");
      if (!fs.existsSync(documentPath)) { sendJson(res, 404, { ok: false, error: "The Program Topology PDF is not included in this installation." }); return; }
      execFile("explorer.exe", [documentPath], error => {
        if (error) console.error("Could not open Program Topology:", error.message);
      });
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/companion/download") {
      const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
      if (!local) { sendJson(res, 403, { ok: false, error: "Create companion programs from Ready Player One on this PC." }); return; }
      const body = JSON.parse((await readBody(req)) || "{}");
      const companion = String(body.companion || "").toLowerCase();
      const companionFiles = {
        two: { fileName: "Ready Player Two 1.0.57.exe", source: "ready-player-two.exe" },
        "dual-boot-undo": { fileName: "Dual Boot Undo 1.0.0.exe", source: "dual-boot-undo.exe" }
      };
      const selected = companionFiles[companion];
      const fileName = selected?.fileName || "";
      if (!selected) { sendJson(res, 400, { ok: false, error: "Choose a supported companion program." }); return; }
      const source = path.join(uiRoot, selected.source);
      if (!fs.existsSync(source)) { sendJson(res, 500, { ok: false, error: `${fileName} is not included in this Ready Player One build.` }); return; }
      const downloads = path.join(os.homedir(), "Downloads");
      fs.mkdirSync(downloads, { recursive: true });
      // Keep one exported file for each RP2 version. Repeated or duplicate
      // requests replace that version instead of producing (1), (2), etc.
      const destination = path.join(downloads, fileName);
      fs.copyFileSync(source, destination);
      // A byte-for-byte companion copy can retain the bundled executable's old
      // modified timestamp on Windows. Stamp the newly created PE so Explorer
      // correctly groups it under Today in Downloads.
      const createdAt = new Date();
      fs.utimesSync(destination, createdAt, createdAt);
      sendJson(res, 200, { ok: true, path: destination, fileName: path.basename(destination) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/medicine/install") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      if (!device || device.access !== "ssh" || device.platform && device.platform !== "batocera") {
        sendJson(res, 400, { ok: false, error: "Select a live Batocera machine with SSH access." });
        return;
      }
      const result = await installMedicineFiles(device);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/bios/install") {
      const system = String(url.searchParams.get("system") || "").toLowerCase();
      const device = await getRuntimeDevice(url.searchParams.get("device") || "Batocera");
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }

      const installed = await installLargeBios(req, device, system);
      sendJson(res, 200, { ok: true, system, ...installed });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/bios/cache-status") {
      sendJson(res, 200, { ok: true, systems: cachedBiosStatus() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/bios/install-cached") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const system = String(body.system || "").toLowerCase();
      const device = await getRuntimeDevice(body.device);
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }
      let installed;
      if (system === "ps1") installed = await installCachedPs1Bios(device);
      else if (system === "ps4") {
        const modules = await installPs4Modules(device);
        const setup = await installPs4System(device);
        await installNintendoPicturePresentation(device, ["ps4"]);
        await runConsoleScrape(device, ["ps4"], true, body.device, "This PC");
        installed = { installed: true, modules: modules.count, emulator: setup.emulator, systemRegistered: true };
      } else installed = await installCachedLargeBios(device, system);
      sendJson(res, 200, { ok: true, system, ...installed });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/transfers/enqueue") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }
      await ensureCurrentBatoceraInstallation(body.device, device);
      const system = String(body.system || "");
      const names = [...new Set(Array.isArray(body.fileNames) ? body.fileNames.map(String) : [])]
        .filter(fileName => !isExcludedLibraryGame(system, fileName));
      let queued = 0;
      for (const fileName of names) {
        const transferKey = JSON.stringify([body.device, system, fileName]);
        const existing = transferJobs.get(transferKey);
        // The caller submits the machine's currently missing titles.  A past
        // completed activity record is only history: the ROM may since have
        // been removed.  Never let that stale history suppress a new Upload
        // All request.
        if (existing?.running) continue;
        const size = localTransferSize(system, fileName);
        transferJobs.set(transferKey, {
          device: body.device, transport: device.access, system, fileName,
          installationId: String(readDeviceSettings()[body.device]?.installationId || ""),
          running: false, completed: false, totalFiles: 0, completedFiles: 0,
          totalBytes: Number(size.totalBytes || 0), transferredBytes: 0,
          skippedFiles: 0, percent: 0, current: "Queued", error: "",
          cancelRequested: false, cancelled: false, autoQueued: true,
          queuedAt: new Date().toISOString(), nextAttemptAt: 0
        });
        queued += 1;
      }
      scheduleTransferPersistence(true);
      sendJson(res, 200, { ok: true, queued, total: names.length });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/roms/add") {
      const body = JSON.parse((await readBody(req)) || "{}");
      // The upload's SSH session verifies reachability itself. A separate port
      // probe can add a noticeable pause before the first transfer byte.
      const device = await getRuntimeDevice(body.device, { skipConnectionProbe: true });
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }
      await ensureCurrentBatoceraInstallation(body.device, device);

      const transferKey = JSON.stringify([body.device, body.system, body.fileName]);
      const existingJob = transferJobs.get(transferKey);
      if (existingJob?.running) {
        sendJson(res, 409, { ok: false, error: "That transfer is already running.", job: existingJob });
        return;
      }
      const job = {
        device: body.device,
        installationId: String(readDeviceSettings()[body.device]?.installationId || ""),
        transport: device.access,
        system: body.system,
        fileName: body.fileName,
        running: true,
        completed: false,
        totalFiles: 0,
        completedFiles: 0,
        totalBytes: 0,
        transferredBytes: 0,
        skippedFiles: 0,
        percent: 0,
        romPercent: 0,
        artworkPercent: 0,
        phase: "rom",
        current: "Starting",
        error: "",
        cancelRequested: false,
        cancelled: false,
        autoQueued: Boolean(existingJob?.autoQueued || existingJob?.queuedAt),
        queuedAt: existingJob?.queuedAt || "",
        nextAttemptAt: 0,
        startedAt: new Date().toISOString()
      };
      transferJobs.set(transferKey, job);
      scheduleTransferPersistence(true);
      try {
        const item = await uploadRom(device, body.system, body.fileName, update => {
          if (job.cancelRequested) throw new Error("Transfer paused by user.");
          Object.assign(job, update);
          // One monotonic progress bar represents the complete operation.
          // ROM bytes occupy 0-75%; picture matching/copying occupies 75-100%.
          // This prevents a copied ROM from looking finished while its cover
          // is still being published.
          job.phase = "rom";
          job.romPercent = job.totalBytes
            ? Math.min(100, Number(((job.transferredBytes / job.totalBytes) * 100).toFixed(1)))
            : 0;
          job.percent = Math.min(75, Number((job.romPercent * 0.75).toFixed(1)));
          scheduleTransferPersistence();
        }, cancel => {
          activeUploadCancels.set(transferKey, cancel);
          if (job.cancelRequested) cancel();
        });
        if (job.cancelRequested) throw new Error("Transfer paused by user.");
        let artwork = { status: "skipped", matched: false, artwork: false };
        try {
          job.phase = "artwork";
          job.percent = 75;
          job.current = "Matching cover";
          job.artworkPercent = 0;
          scheduleTransferPersistence(true);
          artwork = await publishTransferredRomArtwork(device, body.device, body.system, body.fileName, (percent, current) => {
            job.artworkPercent = percent;
            job.percent = Math.min(99.9, Number((75 + (Math.max(0, Math.min(100, Number(percent) || 0)) * 0.25)).toFixed(1)));
            job.current = /default/i.test(String(current || "")) ? "Transferring default cover" : "Transferring cover";
            scheduleTransferPersistence();
          });
        } catch (error) {
          artwork = { status: "failed", matched: false, artwork: false, error: error.message || String(error) };
          console.error(`Post-transfer artwork for ${body.system}/${body.fileName}:`, artwork.error);
        }
        Object.assign(job, { running: false, completed: true, autoQueued: false, phase: "complete", percent: 100, artworkPercent: 100, current: "Complete", artwork, finishedAt: new Date().toISOString() });
        const copiedAtLeastOneFile = Number(job.totalFiles || 0) > 0
          && Number(job.completedFiles || 0) > Number(job.skippedFiles || 0);
        job.resetNeeded = copiedAtLeastOneFile && body.system !== "music";
        if (job.resetNeeded) markSoftResetNeeded(body.device, body.system, body.fileName, job.finishedAt);
        scheduleTransferPersistence(true);
        sendJson(res, 200, { ok: true, item, artwork, job });
      } catch (error) {
        Object.assign(job, {
          running: false,
          completed: false,
          cancelled: job.cancelRequested,
          autoQueued: job.autoQueued && !job.cancelRequested,
          nextAttemptAt: job.cancelRequested ? 0 : Date.now() + 10000,
          error: error.message || String(error),
          finishedAt: new Date().toISOString()
        });
        scheduleTransferPersistence(true);
        throw error;
      } finally {
        activeUploadCancels.delete(transferKey);
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/transfers/status") {
      const requestedDevice = url.searchParams.get("device") || "";
      const requestedSystem = url.searchParams.get("system") || "";
      const requestedFile = url.searchParams.get("fileName") || "";
      if (url.searchParams.get("all") === "1") {
        const matching = [...transferJobs.values()].filter(item => !requestedDevice || item.device === requestedDevice);
        if (url.searchParams.get("unfinished") === "1") {
          const jobs = matching.filter(item => !item.completed && !item.partialDeleted);
          sendJson(res, 200, { ok: true, jobs, resetNeeded: isSoftResetNeeded(requestedDevice) });
          return;
        }
        // Running jobs must never disappear merely because their saved map entry
        // is older than the 50-row activity-history window.
        const running = matching.filter(item => item.running).reverse();
        const recent = matching.filter(item => !item.running).slice(-50).reverse();
        const jobs = [...running, ...recent];
        sendJson(res, 200, { ok: true, jobs, resetNeeded: isSoftResetNeeded(requestedDevice) });
        return;
      }
      let job = null;
      if (requestedFile) {
        job = transferJobs.get(JSON.stringify([requestedDevice, requestedSystem, requestedFile])) || null;
      } else {
        job = [...transferJobs.values()].reverse().find(item =>
          (!requestedDevice || item.device === requestedDevice) &&
          (!requestedSystem || item.system === requestedSystem) && item.running
        ) || null;
      }
      sendJson(res, 200, { ok: true, job });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/transfers/stop") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const transferKey = JSON.stringify([body.device, body.system, body.fileName]);
      const job = transferJobs.get(transferKey);
      if (!job?.running) {
        sendJson(res, 404, { ok: false, error: "That transfer is not currently running." });
        return;
      }
      job.cancelRequested = true;
      job.autoQueued = false;
      job.current = "Stopping";
      scheduleTransferPersistence(true);
      activeUploadCancels.get(transferKey)?.();
      sendJson(res, 200, { ok: true, job });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/transfers/delete-partial") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const transferKey = JSON.stringify([body.device, body.system, body.fileName]);
      const job = transferJobs.get(transferKey);
      if (!job || job.running || !job.cancelled) {
        sendJson(res, 409, { ok: false, error: "Stop the transfer before deleting its partial file." });
        return;
      }
      const device = await getRuntimeDevice(body.device);
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }
      const localPath = safeLocalRomPath(body.system, body.fileName);
      const remotePath = `${remoteDirFor(body.system,device)}/${body.fileName}`;
      const partialPath = fs.existsSync(localPath) && fs.statSync(localPath).isDirectory()
        ? remotePath
        : `${remotePath}.bw-part`;
      await sftpWithDevice(device, sftp => removeRemotePath(sftp, partialPath));
      job.partialDeleted = true;
      job.transferredBytes = 0;
      job.percent = 0;
      job.current = "";
      scheduleTransferPersistence(true);
      sendJson(res, 200, { ok: true, deleted: partialPath, removedFromActivity: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/transfers/dismiss") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const transferKey = JSON.stringify([body.device, body.system, body.fileName]);
      const job = transferJobs.get(transferKey);
      if (job?.running) {
        sendJson(res, 409, { ok: false, error: "Pause the transfer before dismissing it." });
        return;
      }
      transferJobs.delete(transferKey);
      scheduleTransferPersistence(true);
      sendJson(res, 200, { ok: true, dismissed: Boolean(job) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/roms/removal-status") {
      const key = JSON.stringify([
        url.searchParams.get("device") || "",
        url.searchParams.get("system") || "",
        url.searchParams.get("fileName") || ""
      ]);
      sendJson(res, 200, { ok: true, job: removalJobs.get(key) || null });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/roms/remove") {
      const body = JSON.parse((await readBody(req)) || "{}");
      if ([...transferJobs.values()].some(job => job.device === body.device && job.system === body.system && job.running)) {
        sendJson(res, 409, {ok:false, error:"Pause active transfers for this system before deleting its ROMs."});
        return;
      }
      const device = await getRuntimeDevice(body.device);
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }

      const removalKey = JSON.stringify([body.device, body.system, body.fileName]);
      const removalJob = { device: body.device, system: body.system, fileName: body.fileName, running: true, percent: 100, stage: "Deleting ROM" };
      removalJobs.set(removalKey, removalJob);
      try {
        const removal = await removeRom(device, body.system, body.fileName);
        Object.assign(removalJob, { percent: 45, stage: "Deleting picture" });
        const artwork = removal?.queued
          ? { entriesRemoved: 0, picturesRemoved: 0, queued: true }
          : await removePublishedArtwork(device, body.system, body.fileName);
        Object.assign(removalJob, { percent: 15, stage: "Updating free space" });
        clearSoftResetNeededForGame(body.device, body.system, body.fileName);
        const storage = removal?.queued ? null : await getDeviceStorage(device);
        Object.assign(removalJob, { running: false, percent: 0, stage: "Removed" });
        setTimeout(() => { if (removalJobs.get(removalKey) === removalJob) removalJobs.delete(removalKey); }, 5000);
        sendJson(res, 200, { ok: true, queued: Boolean(removal?.queued), artwork, storage, resetNeeded: isSoftResetNeeded(body.device) });
      } catch (error) {
        Object.assign(removalJob, { running: false, failed: true, stage: error.message || "Removal failed" });
        setTimeout(() => { if (removalJobs.get(removalKey) === removalJob) removalJobs.delete(removalKey); }, 5000);
        throw error;
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/systems/remove") {
      const body = JSON.parse((await readBody(req)) || "{}");
      if ([...transferJobs.values()].some(job => job.device === body.device && job.system === body.system && job.running)) {
        sendJson(res, 409, {ok:false, error:"Pause active transfers for this system before removing it."});
        return;
      }
      const device = await getRuntimeDevice(body.device);
      if (!device) {
        sendJson(res, 404, {ok:false, error:"Device is not configured."});
        return;
      }
      const removal = await removeSystem(device, body.system, {deferReset:Boolean(body.deferReset)});
      sendJson(res, 200, {ok:true, system:body.system, resetApplied:Boolean(removal?.resetApplied), removedRoots:removal?.removedRoots || []});
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/scraper/config") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }
      const result = await saveScraperConfig(device, body);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/scraper/settings") {
      const settings = readScraperSettings();
      const providerValue = { "This PC": "thispc", "The Cover Project": "coverproject", ScreenScraper: "screenscraper", TheGamesDB: "thegamesdb", ArcadeDB: "arcadedb", IGDB: "igdb" }[settings.provider] || "thispc";
      sendJson(res, 200, { ok: true, provider: providerValue, configured: {
        screenscraper: Boolean(settings.screenScraperUsername && settings.screenScraperPassword && settings.screenScraperDevId && settings.screenScraperDevPassword),
        thegamesdb: Boolean(settings.theGamesDbApiKey),
        igdb: Boolean(settings.igdbClientId && settings.igdbClientSecret),
        arcadedb: true,
        coverproject: true,
        thispc: fs.existsSync(path.join(root, "covers"))
      }});
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/console-scraper/start") {
      if (consoleScrapeJob.running) {
        sendJson(res, 409, { ok: false, error: "Console scraping is already running." });
        return;
      }
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      if (!device) {
        sendJson(res, 404, { ok: false, error: "Device is not configured." });
        return;
      }
      runConsoleScrape(device, Array.isArray(body.systems) ? body.systems : [], Boolean(body.overwrite), body.device).catch(error => {
        consoleScrapeJob.running = false;
        consoleScrapeJob.current = "";
        consoleScrapeJob.errors.push(error.message);
        consoleScrapeJob.finishedAt = new Date().toISOString();
        persistConsoleScrapeJob();
      });
      sendJson(res, 202, { ok: true, job: consoleScrapeJob });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/console-artwork/setup") {
      if (consoleScrapeJob.running) {
        sendJson(res, 409, { ok: false, error: "Console artwork setup is already running." });
        return;
      }
      const body = JSON.parse((await readBody(req)) || "{}");
      const system = String(body.system || "").toLowerCase();
      const device = await getRuntimeDevice(body.device);
      if (!device || device.access !== "ssh" || device.platform && device.platform !== "batocera") {
        sendJson(res, 409, { ok: false, error: "Automatic console artwork requires a live Batocera machine with SSH access." });
        return;
      }
      if (!["nes", "snes", "gba", "n64", "gamecube", "wii", "wiiu", "ps1", "ps2", "ps3", "ps4", "xbox", "xbox360", "mame"].includes(system)) {
        sendJson(res, 400, { ok: false, error: "Automatic cartridge artwork is not configured for this console yet." });
        return;
      }
      if (system === "nes") await removeExcludedNes2048FromBatocera(device);
      if (["nes", "snes", "gba", "n64", "gamecube", "wii", "wiiu", "ps1", "ps2", "ps3", "ps4", "xbox", "xbox360", "mame"].includes(system)) {
        await clearLegacyNintendoArtwork(device, [system]);
        await installNintendoPicturePresentation(device, [system]);
      }
      await runConsoleScrape(device, [system], true, body.device, "This PC");
      await execSsh(device, 'sh -c "(batocera-es-swissknife --restart >/dev/null 2>&1 || /etc/init.d/S31emulationstation restart >/dev/null 2>&1 || (/etc/init.d/S31emulationstation stop >/dev/null 2>&1; /etc/init.d/S31emulationstation start >/dev/null 2>&1)) >/dev/null 2>&1 & echo OK"', 15000);
      sendJson(res, 200, { ok: true, system, job: consoleScrapeJob });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/console-artwork/apply-presentation") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      if (!device || device.access !== "ssh" || device.platform && device.platform !== "batocera") {
        sendJson(res, 409, { ok: false, error: "Automatic layout artwork requires a live Batocera machine with SSH access." });
        return;
      }
      const supported = new Set(["nes", "snes", "gba", "n64", "gamecube", "wii", "wiiu", "ps1", "ps2", "ps3", "ps4", "xbox", "xbox360", "mame"]);
      const systems = [...new Set((Array.isArray(body.systems) ? body.systems : []).map(value => String(value || "").toLowerCase()).filter(value => supported.has(value)))];
      if (!systems.length) {
        sendJson(res, 400, { ok: false, error: "No supported console layouts were requested." });
        return;
      }
      await installNintendoPicturePresentation(device, systems);
      await execSsh(device, 'sh -c "(batocera-es-swissknife --restart >/dev/null 2>&1 || /etc/init.d/S31emulationstation restart >/dev/null 2>&1 || (/etc/init.d/S31emulationstation stop >/dev/null 2>&1; /etc/init.d/S31emulationstation start >/dev/null 2>&1)) >/dev/null 2>&1 & echo OK"', 15000);
      sendJson(res, 200, { ok: true, systems });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/console-artwork/collections") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      if (!device || device.access !== "ssh" || device.platform && device.platform !== "batocera") {
        sendJson(res, 409, { ok: false, error: "The All Games layout requires a live Batocera machine with SSH access." });
        return;
      }
      await installRp1CollectionCoverPresentation(device);
      await execSsh(device, 'sh -c "(batocera-es-swissknife --restart >/dev/null 2>&1 || /etc/init.d/S31emulationstation restart >/dev/null 2>&1 || (/etc/init.d/S31emulationstation stop >/dev/null 2>&1; /etc/init.d/S31emulationstation start >/dev/null 2>&1)) >/dev/null 2>&1 & echo OK"', 15000);
      sendJson(res, 200, { ok: true, columns: 5, collections: ["all", "favorites"] });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/console-artwork/sync-layout") {
      if (consoleScrapeJob.running) {
        sendJson(res, 409, { ok: false, error: "Automatic artwork is already running." });
        return;
      }
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      if (!device || device.access !== "ssh" || device.platform && device.platform !== "batocera") {
        sendJson(res, 409, { ok: false, error: "Automatic layout artwork requires a live Batocera machine with SSH access." });
        return;
      }
      const requested = [...new Set((Array.isArray(body.systems) ? body.systems : [])
        .map(system => String(system || "").toLowerCase())
        .filter(system => systemFolders[system] && hasLocalConsoleCoverFolder(system)))];
      if (!requested.length) {
        sendJson(res, 200, { ok: true, systems: [], matchedFiles: [], unmatchedFiles: [], job: { artwork: 0, matched: 0, processed: 0 } });
        return;
      }
      const installedFiles = new Map();
      for (const system of requested) installedFiles.set(system, await listBatoceraRomFiles(device, system));
      await clearLegacyNintendoArtwork(device, requested);
      await installNintendoPicturePresentation(device, requested);
      await runConsoleScrape(device, requested, true, body.device, "This PC");
      await execSsh(device, 'sh -c "(batocera-es-swissknife --restart >/dev/null 2>&1 || /etc/init.d/S31emulationstation restart >/dev/null 2>&1 || (/etc/init.d/S31emulationstation stop >/dev/null 2>&1; /etc/init.d/S31emulationstation start >/dev/null 2>&1)) >/dev/null 2>&1 & echo OK"', 15000);
      const matchedFiles = [];
      const unmatchedFiles = [];
      for (const system of requested) {
        for (const fileName of installedFiles.get(system) || []) {
          (await findLocalConsoleCover(system, fileName) ? matchedFiles : unmatchedFiles).push({ system, fileName });
        }
      }
      sendJson(res, 200, { ok: true, systems: requested, matchedFiles, unmatchedFiles, job: consoleScrapeJob });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/console-scraper/status") {
      const pending = artworkPublishQueue.list().filter(job => !url.searchParams.get('device') || job.deviceName === url.searchParams.get('device'));
      sendJson(res, 200, { ok: true, job: { ...consoleScrapeJob,
        pendingArtwork: pending.reduce((sum, job) => sum + job.artwork.length, 0),
        pendingPublish: pending.length,
        publishError: pending.find(job => job.error)?.error || ''
      } });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/console-scraper/cancel") {
      consoleScrapeJob.cancelled = true;
      persistConsoleScrapeJob();
      sendJson(res, 200, { ok: true, job: consoleScrapeJob });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/music-scraper/start") {
      if (musicScrapeJob.running) {
        sendJson(res, 409, { ok: false, error: "Music scraping is already running." });
        return;
      }
      const body = JSON.parse((await readBody(req)) || "{}");
      const device = await getRuntimeDevice(body.device);
      runMusicScrape(device, Boolean(body.overwrite)).catch(error => {
        musicScrapeJob.running = false;
        musicScrapeJob.current = "";
        musicScrapeJob.errors.push(error.message);
        musicScrapeJob.finishedAt = new Date().toISOString();
      });
      sendJson(res, 202, { ok: true, job: musicScrapeJob });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/music-scraper/status") {
      sendJson(res, 200, { ok: true, job: musicScrapeJob });
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, { ok: false, error: "Method not allowed" });
      return;
    }

    let filePath = url.pathname === "/" ? "Ready Player One.html" : decodeURIComponent(url.pathname.slice(1));
    if (filePath === "Batocera Warehouse.html") filePath = "Ready Player One.html"; // old bookmarks
    filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
    const absolute = path.join(root, filePath);
    if (!absolute.startsWith(root) || !fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(absolute).toLowerCase();
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    });
    const fileSize = fs.statSync(absolute).size;
    // HTML, CSS, JavaScript, and interface artwork should paint atomically.
    // Streaming these small assets allowed transfer callbacks to delay later
    // chunks for many seconds, leaving legacy/half-painted UI on screen.
    if (fileSize <= 2 * 1024 * 1024) res.end(fs.readFileSync(absolute));
    else fs.createReadStream(absolute).pipe(res);
  } catch (error) {
    let message = error.message || "Request failed.";
    if (/ECONNREFUSED .*:22/.test(message) || /Timed out while waiting for handshake/.test(message)) {
      message = "Batocera is reachable, but SSH is closed. Enable SSH on Batocera before listing or sending files.";
    }
    sendJson(res, 500, { ok: false, error: message });
  }
});

function requestQueuedTransfer(job) {
  const payload = Buffer.from(JSON.stringify({
    device: job.device,
    system: job.system,
    fileName: job.fileName
  }));
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/api/roms/add",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": payload.length
      },
      // Large disc images can legitimately take hours over Wi-Fi.  This is a
      // watchdog request, not a short UI request, so do not mistake a quiet
      // active copy for a stalled transfer.
      timeout: 24 * 60 * 60 * 1000
    }, response => {
      response.resume();
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve();
        else reject(new Error(`Queued transfer returned HTTP ${response.statusCode}.`));
      });
    });
    request.on("timeout", () => request.destroy(new Error("Queued transfer request timed out.")));
    request.on("error", reject);
    request.end(payload);
  });
}

let queuedTransferDispatchRunning = false;
const backendStartedAt = Date.now();
async function dispatchPersistedTransferQueue() {
  // Let the UI, library, and saved-machine cards become usable before an old
  // bulk queue opens up to ten encrypted transfer streams. The watchdog below
  // will resume the same durable jobs after this short grace period.
  if (Date.now() - backendStartedAt < 8000) return;
  if (queuedTransferDispatchRunning) return;
  queuedTransferDispatchRunning = true;
  try {
    const now = Date.now();
    const candidates = [...transferJobs.values()].filter(job => {
      if (!job || job.running || job.dispatching || job.completed || job.cancelled || job.cancelRequested || job.partialDeleted) return false;
      // A persisted queue is tied to the image that created it. Wait for a
      // fresh SSH identity check before resuming anything on Batocera.
      if (devices[job.device] && (!readDeviceSettings()[job.device]?.installationId ||
          verifiedInstallationIds.get(job.device) !== readDeviceSettings()[job.device].installationId)) return false;
      if (!(job.autoQueued || job.queuedAt)) return false;
      if (Number(job.nextAttemptAt || 0) > now) return false;
      try {
        return fs.existsSync(safeLocalRomPath(job.system, job.fileName));
      } catch {
        return false;
      }
    });

    const deviceNames = [...new Set(candidates.map(job => job.device))];
    for (const deviceName of deviceNames) {
      // A queued request is marked dispatching before the loopback POST has
      // entered /api/roms/add and replaced it with a running job. Count that
      // hand-off against the device limit too. Otherwise each watchdog tick
      // can launch another full batch while the previous batch is still at
      // 0%, producing dozens of apparent simultaneous transfers.
      const activeSlots = [...transferJobs.values()].filter(job =>
        job.device === deviceName && (job.running || job.dispatching));
      const queued = candidates.filter(job => job.device === deviceName);
      const smallQueued = queued.filter(job => Number(job.totalBytes || localTransferSize(job.system, job.fileName).totalBytes || 0) <= 50 * 1024 * 1024);
      const selectedPool = smallQueued.length ? smallQueued : queued;
      // SFTP encryption and progress callbacks execute in this same Node
      // process as the desktop UI. More sessions made the window and artwork
      // requests wait 8-30 seconds. Keep useful parallelism without starving
      // the application itself.
      const concurrency = 1;
      const available = Math.max(0, concurrency - activeSlots.length);
      for (const job of selectedPool.slice(0, available)) {
        job.dispatching = true;
        job.current = "Restarting";
        scheduleTransferPersistence();
        requestQueuedTransfer(job).catch(error => {
          const current = transferJobs.get(JSON.stringify([job.device, job.system, job.fileName]));
          if (!current || current.running || current.completed || current.cancelled) return;
          current.running = false;
          current.dispatching = false;
          current.autoQueued = true;
          current.nextAttemptAt = Date.now() + 10000;
          current.error = error.message || String(error);
          scheduleTransferPersistence(true);
        });
      }
    }
  } finally {
    queuedTransferDispatchRunning = false;
  }
}

server.listen(port, () => {
  console.log(`Ready Player One: http://localhost:${port}`);
  // Saved machines are checked by the fast status endpoint. Do not launch a
  // subnet-wide discovery here: parts of discovery are synchronous and used
  // to stall the entire UI during startup. Find Machines remains the explicit
  // path for discovering new hardware.
  // Resume durable bulk queues even when the UI has not loaded yet.  The
  // backend owns this watchdog so closing/reopening RP1 cannot strand work.
  dispatchPersistedTransferQueue().catch(error => console.error("Queued transfer startup failed:", error));
});

const automaticTransferResume = setInterval(() => {
  dispatchPersistedTransferQueue().catch(error => console.error("Queued transfer restart failed:", error));
}, 1500);
automaticTransferResume.unref();
