// scripts/campus-pins.mjs
// Writes CAMPUS_PINS.md: every campus place in functions/src/campus.ts with
// its pin and a Google Maps link, grouped as students see them, so pins can
// be checked one by one. Places pinned by the owner are marked done; the
// rest say where their pin came from.
// Run after editing campus.ts (and building functions):
//   cd functions && npm run build && cd .. && node scripts/campus-pins.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { DROP_POINTS, PICKUP_POINTS, CAMPUS_AREAS } = require(path.join(root, 'functions/lib/campus.js'));

const HOW = {
  owner: 'Pinned by you',
  google: 'Google Maps pin (your directory)',
  osm: 'Map building',
  'osm-blocks': 'Middle of the hall’s blocks',
  'osm-building': 'The building it’s in',
  approx: '**Estimate: please pin**',
  missing: '**No pin yet: please pin**',
};
const link = x => (x.latitude === null ? '' : `[${x.latitude.toFixed(5)}, ${x.longitude.toFixed(5)}](https://www.google.com/maps?q=${x.latitude},${x.longitude})`);
const row = x => `| ${x.source === 'owner' || x.source === 'google' ? '✓' : ''} | ${x.name} | ${link(x)} | ${HOW[x.source]} |`;
const table = list => ['| Done | Place | Pin (opens Google Maps) | Where the pin came from |', '|---|---|---|---|', ...list.map(row)].join('\n');

const all = [...DROP_POINTS, ...PICKUP_POINTS];
const done = all.filter(x => x.source === 'owner' || x.source === 'google').length;
const todo = all.filter(x => x.source === 'approx' || x.source === 'missing');

const md = `# Campus pins

Generated from \`functions/src/campus.ts\` by \`scripts/campus-pins.mjs\`. **${done} of ${all.length} pinned by you or from your directory.**
Delivery fees are measured from these pins, so the more exact they are, the fairer the fees.

**How to check a pin:** open its link. If the marker isn't on the right building or entrance, long-press the right spot in Google Maps, copy the numbers it shows (e.g. \`18.00683, -76.74725\`) and send them with the place name. For a hall, pin where dashers should hand over the food (main gate, porter's lodge or common area). For a food spot, pin its counter or door.

${todo.length ? `**Needs a pin first (${todo.length}):** ${todo.map(x => x.name).join(', ')}.` : 'Every place has a pin.'}

${CAMPUS_AREAS.map(a => `## ${a.label}\n\n${table(DROP_POINTS.filter(x => x.area === a.id))}`).join('\n\n')}

## Food spots (where dashers pick up)

${table(PICKUP_POINTS)}
`;
writeFileSync(path.join(root, 'CAMPUS_PINS.md'), md);
console.log(`Wrote CAMPUS_PINS.md (${all.length} places, ${todo.length} need a pin).`);
