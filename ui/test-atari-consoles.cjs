const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "Ready Player One.html"), "utf8");
const server = fs.readFileSync(path.join(root, "ui", "server.js"), "utf8");

const systems = [
  ["atari2600", "Atari 2600", "atari2600"],
  ["atari5200", "Atari 5200", "atari5200"],
  ["atari7800", "Atari 7800", "atari7800"],
  ["atarilynx", "Atari Lynx", "lynx"],
  ["xegs", "Atari XEGS", "xegs"],
  ["jaguar", "Atari Jaguar", "jaguar"],
  ["jaguarcd", "Atari Jaguar CD", "jaguarcd"],
  ["atari800", "Atari 400/800/XL/XE", "atari800"],
  ["atarist", "Atari ST/STE/TT/Falcon", "atarist"],
];

for (const [id, label, folder] of systems) {
  const rowMatches = html.match(new RegExp(`<div\\s+class=["'][^"']*\\brow\\b[^"']*["'][^>]*data-system=["']${id}["']`, "g")) || [];
  if (rowMatches.length !== 1) throw new Error(`${id} must have exactly one console row`);
  if (!html.includes(`>${label}</span>`)) throw new Error(`${id} is missing its console label`);
  if (!server.includes(`${id}: "${folder}"`)) throw new Error(`${id} is not mapped to Batocera folder ${folder}`);
  if (!server.includes(`${id}: [".`)) throw new Error(`${id} is missing its ROM extensions`);
}

for (const folder of ["xegs", "jaguar", "jaguarcd", "atari800", "atarist"]) {
  if (!server.includes(`"${folder}"`)) throw new Error(`${folder} is missing from shared Atari support`);
}

console.log("Atari console regression checks passed for all 9 systems.");
