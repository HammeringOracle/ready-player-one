const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(html, /data-system="movies"[\s\S]*?>Movies</u, 'Movies must appear in the selectable Systems list');
assert.match(html, /\/api\/movies\/status/u, 'Movies setup must verify its machine installation');
assert.match(html, /\/api\/movies\/install/u, 'Movies setup must install its launcher');
assert.match(server, /movies:\s*\["\.mp4", "\.mkv", "\.avi"/u, 'The local library must recognize common movie formats');
assert.match(server, /<name>movies<\/name>[\s\S]*?<command>\/userdata\/system\/scripts\/rp1-movies-vlc\.sh "%ROM%"<\/command>/u,
  'Batocera Movies must launch through the dedicated VLC script');
assert.match(server, /--fullscreen --play-and-exit --no-video-title-show/u,
  'VLC must launch movies fullscreen and return to Batocera when playback ends');
assert.match(server, /unescaped="\$\(printf '%s' "\$rom" \| sed 's\/\\\\\\\\\/\/g'\)"/u,
  'The Movies launcher must resolve EmulationStation-escaped filenames');
assert.ok(fs.existsSync(path.join(__dirname, 'system-art', 'movies.png')), 'The bundled Movies icon must exist');

console.log('Movies VLC library and launcher checks passed.');
