// scripts/web-postbuild.mjs
// Runs after `expo export --platform web` (npm run build:web). SPEED:
//   1. dist/precache.json: every screen file and the app's own fonts, which
//      the service worker fetches in the background after the first load
//      (warmCache in public/sw.js), so every later tap is instant.
//   2. <link rel="preload"> in dist/index.html for the two heading/script
//      fonts, so they download alongside the app code instead of after it.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (!existsSync(dist)) throw new Error('Run expo export first (dist/ is missing).');

const jsDir = path.join(dist, '_expo/static/js/web');
const js = readdirSync(jsDir).filter(f => f.endsWith('.js')).map(f => `/_expo/static/js/web/${f}`);
const fontDir = path.join(dist, 'assets/assets/fonts');
const fonts = existsSync(fontDir)
  ? readdirSync(fontDir).filter(f => /\.(ttf|otf|woff2?)$/.test(f)).map(f => `/assets/assets/fonts/${f}`)
  : [];
const files = [...js, ...fonts, '/brand/dormdash-tile.png', '/brand/jc-logo.png', '/icons/badge-96.png'];
writeFileSync(path.join(dist, 'precache.json'), JSON.stringify({ files }, null, 1));

const htmlPath = path.join(dist, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
const preload = fonts.map(f => `<link rel="preload" href="${f}" as="font" type="font/${f.split('.').pop() === 'ttf' ? 'ttf' : 'woff2'}" crossorigin>`).join('');
if (preload && !html.includes('rel="preload" href="/assets/assets/fonts/')) {
  html = html.replace('</head>', `${preload}</head>`);
  writeFileSync(htmlPath, html);
}
console.log(`web-postbuild: precache.json (${files.length} files, ${js.length} scripts, ${fonts.length} fonts); fonts preloaded.`);
