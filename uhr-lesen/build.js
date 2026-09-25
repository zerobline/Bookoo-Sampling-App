// Inlines CSS and JS into one self-contained file: dist/uhr-lesen.html.
// That file can be copied to a tablet/phone and opened directly, no server needed.
'use strict';
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
let html = read('index.html');

html = html.replace('<link rel="stylesheet" href="style.css">', () => '<style>\n' + read('style.css') + '</style>');
for (const js of ['time-phrase.js', 'clock.js', 'app.js']) {
  html = html.replace(`<script src="${js}"></script>`, () => '<script>\n' + read(js) + '</script>');
}
const icon = 'data:image/svg+xml;base64,' + Buffer.from(read('icon.svg')).toString('base64');
html = html.replace('href="icon.svg"', `href="${icon}"`);
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');

fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
fs.writeFileSync(path.join(dir, 'dist', 'uhr-lesen.html'), html);
console.log('wrote dist/uhr-lesen.html (' + Math.round(html.length / 1024) + ' KB)');
