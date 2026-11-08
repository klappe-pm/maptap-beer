// Refreshes the two data snapshots the Pages build reads, so CI never needs these sources:
//   release/regions.json  brewery id -> region or state, from the Open Brewery DB snapshot the
//                         release was built from (SHA-256 checked against the release's record)
//   release/gabf.json     brewery id -> GABF medal summary and gabf.beer page slug, from a local
//                         checkout of GABF Analysis (klappe-pm/GABF-Analysis)
//
// Usage: node scripts/import-data.mjs --obdb <breweries.json> --gabf <GABF-Analysis checkout>
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const obdbPath = arg('--obdb');
const gabfRoot = arg('--gabf');
if (!obdbPath || !gabfRoot) throw new Error('Usage: node scripts/import-data.mjs --obdb <breweries.json> --gabf <GABF-Analysis checkout>');

// The release's own record of the snapshot it was built from.
const SNAPSHOT_SHA256 = '36bd351e8f45995934f40d9df0f01f66ffc22f283dea2f054a4b716c5fa81957';

const game = readFileSync(join(root, 'release/game.js'), 'utf8');
const catalog = JSON.parse(game.match(/var e=`(\[.*?\])`,t=\{/s)[1]);
const ids = new Set(catalog.map((b) => b.id));

// Regions --------------------------------------------------------------------------------------
const obdbRaw = readFileSync(obdbPath);
const sha = createHash('sha256').update(obdbRaw).digest('hex');
if (sha !== SNAPSHOT_SHA256) throw new Error(`Open Brewery DB snapshot hash ${sha} does not match the release (${SNAPSHOT_SHA256}).`);
const obdb = new Map(JSON.parse(obdbRaw).map((b) => [b.id, b]));

const ALIASES = {
  Vlaanderen: 'Flanders', 'Région flamande': 'Flanders', 'Région wallonne': 'Wallonia',
  'Brussels Capital Region': 'Brussels', VIC: 'Victoria', NSW: 'New South Wales', QLD: 'Queensland',
  SA: 'South Australia', WA: 'Western Australia', TAS: 'Tasmania', ACT: 'Australian Capital Territory',
  NT: 'Northern Territory', Bayern: 'Bavaria',
};
// The ten hand-curated breweries are not Open Brewery DB records.
const CURATED = {
  coopers: 'South Australia', 'pilsner-urquell': 'Plzeň Region', duvel: 'Flanders',
  'garage-project': 'Wellington Region', 'sierra-nevada': 'California', guinness: 'Dublin',
  weihenstephan: 'Bavaria', bohemia: 'Rio de Janeiro', 'baird-shuzenji': 'Shizuoka', 'darling-brew': 'Western Cape',
};
// Curated pins use their own ids, so link any GABF medalist among them by GABF key.
const CURATED_GABF = { 'sierra-nevada': 'sierra nevada' };
const regions = {};
for (const b of catalog) {
  const raw = CURATED[b.id] ?? obdb.get(b.id)?.state_province ?? obdb.get(b.id)?.state ?? '';
  const region = String(raw).trim();
  if (region) regions[b.id] = ALIASES[region] ?? region;
}

// GABF -----------------------------------------------------------------------------------------
const enriched = JSON.parse(readFileSync(join(gabfRoot, 'data/enriched/breweries.json'), 'utf8')).breweries;
const published = new Map(JSON.parse(readFileSync(join(gabfRoot, 'web/out/data/breweries.json'), 'utf8')).map((b) => [b.key, b]));
const gabf = {};
let breweries = 0;
for (const b of Array.isArray(enriched) ? enriched : Object.values(enriched)) {
  const pub = published.get(b.key);
  if (!pub || !pub.medals) continue;
  const locationIds = new Set([b.best?.id, ...(b.locations ?? []).map((l) => l?.id)].filter((id) => id && ids.has(id)));
  for (const [id, key] of Object.entries(CURATED_GABF)) if (key === b.key) locationIds.add(id);
  if (!locationIds.size) continue;
  breweries++;
  const summary = {
    slug: pub.slug,
    name: pub.name,
    gold: pub.by_medal?.Gold ?? 0,
    silver: pub.by_medal?.Silver ?? 0,
    bronze: pub.by_medal?.Bronze ?? 0,
    medals: pub.medals,
    first: pub.first_year,
    last: pub.last_year,
  };
  for (const id of locationIds) gabf[id] = summary;
}

writeFileSync(join(root, 'release/regions.json'), JSON.stringify(regions) + '\n');
writeFileSync(join(root, 'release/gabf.json'), JSON.stringify(gabf) + '\n');
console.log(`regions: ${Object.keys(regions).length} of ${catalog.length} breweries`);
console.log(`gabf: ${breweries} medal-winning breweries on ${Object.keys(gabf).length} pins`);
