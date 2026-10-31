const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Ready Player One.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const movieTheme = fs.readFileSync(path.join(__dirname, 'local-media-theme.js'), 'utf8');

assert.match(html, /data-system="movies"[\s\S]*?>Movies</u, 'Movies must appear in the selectable Systems list');
assert.match(html, /\/api\/movies\/status/u, 'Movies setup must verify its machine installation');
assert.match(html, /\/api\/movies\/install/u, 'Movies setup must install its launcher');
assert.match(server, /movies:\s*\["\.mp4", "\.mkv", "\.avi"/u, 'The local library must recognize common movie formats');
assert.match(server, /<name>movies<\/name>[\s\S]*?<command>\/userdata\/system\/scripts\/rp1-movies-vlc\.sh "%ROM%"<\/command>/u,
  'Batocera Movies must launch through the dedicated VLC script');
assert.match(server, /--fullscreen --play-and-exit --no-video-title-show/u,
  'VLC must launch movies fullscreen and return to Batocera when playback ends');
assert.match(server, /vlc_pid=\$![\s\S]*?xcb_\(window\|vout display\).*X server failure[\s\S]*?kill -TERM "\$vlc_pid"/u,
  'Closing the VLC video window must terminate its remaining audio process');
assert.match(server, /trap cleanup_movie EXIT INT TERM HUP/u,
  'The Movies launcher must clean up VLC when EmulationStation closes it');
assert.match(server, /grep -Fq [^\n]*xcb_\(window\|vout display\).*X server failure[\s\S]*?launcher_cleanup/u,
  'Adding Movies must detect and replace an older launcher without Alt+F4 cleanup');
assert.match(server, /unescaped="\$\(printf '%s' "\$rom" \| sed 's\/\\\\\\\\\/\/g'\)"/u,
  'The Movies launcher must resolve EmulationStation-escaped filenames');
assert.ok(fs.existsSync(path.join(__dirname, 'system-art', 'movies.png')), 'The bundled Movies icon must exist');
assert.equal((movieTheme.match(/<fontSize>0\.030<\/fontSize>/g) || []).length, 2,
  'Movies must use the same 0.030 game-title size as MAME in the Carbon grid.');

console.log('Movies VLC library and launcher checks passed.');
