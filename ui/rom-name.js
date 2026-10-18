const path = require('node:path');

module.exports = function cleanRomName(fileName) {
  const baseName = path.basename(String(fileName || ''));
  // Redump-style original Xbox images are commonly named *.xiso.iso. Treat
  // that compound suffix as one format marker; leaving "xiso" in the title
  // breaks local artwork matching and displays the wrong game name.
  const withoutExtension = /\.xiso\.iso$/i.test(baseName)
    ? baseName.slice(0, -'.xiso.iso'.length)
    : path.basename(baseName, path.extname(baseName));
  return withoutExtension
    .replace(/[_+.]+/g, ' ')
    .replace(/\s*[\[(].*?[\])]/g, '')
    .replace(/\s+/g, ' ').trim();
};
