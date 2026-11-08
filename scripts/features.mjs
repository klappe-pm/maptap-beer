// Feature layer for the static edition, applied by build-pages.mjs:
//   - place filters (Continent, Country, Region or State, City) for Practice and the atlas
//   - GABF medal card on the atlas brewery card and the round result, linking to gabf.beer
//   - country names as HTML labels, finer country fills, zoom-aware label density
//   - title case for labels and links, and the "Fresh Taps Daily" tagline
//   - feature flags from pages/features.json (The Crew is off by default)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const CONTINENTS = {
  'United States': 'North America', Canada: 'North America',
  Brazil: 'South America',
  Germany: 'Europe', Belgium: 'Europe', Netherlands: 'Europe', Ireland: 'Europe', Finland: 'Europe',
  England: 'Europe', Scotland: 'Europe', 'Isle of Man': 'Europe', Portugal: 'Europe', Poland: 'Europe',
  Austria: 'Europe', Sweden: 'Europe', Italy: 'Europe', France: 'Europe', Czechia: 'Europe',
  Australia: 'Oceania', 'New Zealand': 'Oceania',
  'South Africa': 'Africa',
  'South Korea': 'Asia', Japan: 'Asia', Singapore: 'Asia',
};

export function readFeatures(root) {
  return { crew: false, ...JSON.parse(readFileSync(join(root, 'pages/features.json'), 'utf8')) };
}

// Data files ---------------------------------------------------------------------------------

// Writes the enriched atlas catalog, the place hierarchy, and the API's brewery metadata.
export function buildData(release, out) {
  const regions = JSON.parse(readFileSync(join(release, 'regions.json'), 'utf8'));
  const gabf = JSON.parse(readFileSync(join(release, 'gabf.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(join(release, 'client/catalog.json'), 'utf8'));
  const tree = new Map();
  const add = (map, name) => {
    if (!map.has(name)) map.set(name, { name, count: 0, children: new Map() });
    const node = map.get(name);
    node.count++;
    return node.children;
  };
  for (const b of catalog) {
    const continent = CONTINENTS[b.country];
    if (!continent) throw new Error(`No continent for country "${b.country}". Add it to CONTINENTS in scripts/features.mjs.`);
    b.continent = continent;
    if (regions[b.id]) b.region = regions[b.id];
    if (gabf[b.id]) b.gabf = gabf[b.id];
    let level = add(tree, continent);
    level = add(level, b.country);
    if (b.region) {
      level = add(level, b.region);
      if (b.city) add(level, b.city);
    }
  }
  const toList = (map) =>
    [...map.values()]
      .map(({ name, count, children }) => ({ name, count, children: toList(children) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(join(out, 'catalog.json'), JSON.stringify(catalog));
  writeFileSync(join(out, 'places.json'), JSON.stringify(toList(tree)));
  writeFileSync(join(out, 'local-api/meta.json'), JSON.stringify({ regions, gabf, continents: CONTINENTS }));
  return { breweries: catalog.length, medalists: Object.keys(gabf).length };
}

// Country labels -----------------------------------------------------------------------------

// [name, lat, lng, rank] from Natural Earth's label point and label rank.
export function countryLabels(release) {
  const { features } = JSON.parse(readFileSync(join(release, 'client/countries.geojson'), 'utf8'));
  return features
    .map(({ properties: p }) => [p.NAME, +p.LABEL_Y.toFixed(2), +p.LABEL_X.toFixed(2), p.LABELRANK])
    .filter(([name, lat, lng]) => name && Number.isFinite(lat) && Number.isFinite(lng));
}

// Title case ---------------------------------------------------------------------------------

// Labels and links in title case; headlines, sentences and descriptions keep sentence case.
// Each entry replaces a whole string literal in the bundle and the same text in the
// server-rendered HTML, so hydration still matches.
export const TITLE_CASE = [
  ['Daily flight', 'Daily Flight'], ['Brewery atlas', 'Brewery Atlas'], ['The crew', 'The Crew'],
  ['My taproom', 'My Taproom'], ['Sign in ', 'Sign In '],
  ['THE BREWERY ATLAS', 'The Brewery Atlas'], ['A FLIGHT WITH YOUR CREW', 'A Flight With Your Crew'],
  ['A LITTLE PRACTICE, A LOT TO DISCOVER', 'A Little Practice, a Lot to Discover'],
  ['FRESHLY TAPPED. DAILY.', 'Fresh Taps Daily'],
  ['Your next discovery', 'Your Next Discovery'],
  ['ROUND ', 'Round '], [' RESULTS', ' Results'], ['BREWERY ', 'Brewery '], [' OF 5', ' of 5'],
  ['Read the source ', 'Read the Source '], ['See your flight', 'See Your Flight'], ['Next brewery', 'Next Brewery'],
  ['FLIGHT COMPLETE', 'Flight Complete'], ['Share your score', 'Share Your Score'],
  ['Keep exploring in Practice ', 'Keep Exploring in Practice '],
  ['Lock in your guess', 'Lock In Your Guess'], ['Clear pin', 'Clear Pin'],
  ['Prefer entering coordinates?', 'Prefer Entering Coordinates?'], ['Place coordinates', 'Place Coordinates'],
  ['CREW CHALLENGE', 'Crew Challenge'], ['THE OPEN TAP', 'The Open Tap'], ['TODAY’S FLIGHT', 'Today’s Flight'],
  ['breweries', 'Breweries'], ['world to explore', 'World to Explore'], ['possible points', 'Possible Points'],
  ['Take the challenge', 'Take the Challenge'], ['Start exploring', 'Start Exploring'],
  ['Start today’s flight', 'Start Today’s Flight'], ['New here? Here’s how it works', 'New Here? Here’s How It Works'],
  ['EXPLORE MODE', 'Explore Mode'], ['THE REVEAL', 'The Reveal'], ['PLACE YOUR PIN', 'Place Your Pin'],
  ['A WHOLE WORLD ON TAP', 'A Whole World on Tap'], ['Map style', 'Map Style'],
  ['BREWED AROUND', 'Brewed Around'], ['THE WORLD', 'The World'],
  ['A PIN WORTH EXPLORING', 'A Pin Worth Exploring'], ['Brewery website ', 'Brewery Website '],
  ['Your pin ', 'Your Pin '], ['The brewery', 'The Brewery'],
  ['YOUR FLIGHT', 'Your Flight'], ['FIVE STOPS. ONE GOOD JOURNEY.', 'Five Stops. One Good Journey.'],
  ['First sip', 'First Sip'], ['Last call', 'Last Call'], ['TOTAL SCORE', 'Total Score'],
  ['BETTER WITH YOUR PEOPLE', 'Better With Your People'], ['THERE’S A STORY IN EVERY PIN', 'There’s a Story in Every Pin'],
  ['About & sources', 'About & Sources'],
  ['Botanical atlas', 'Botanical Atlas'], ['Night lights', 'Night Lights'],
  ['Country borders', 'Country Borders'], ['City labels', 'City Labels'], ['River labels', 'River Labels'],
  ['Country hint', 'Country Hint'],
  ['Read the clue', 'Read the Clue'], ['Find its home', 'Find Its Home'], ['Make your call', 'Make Your Call'],
  ['Enjoy the discovery', 'Enjoy the Discovery'], ['Got it. Let’s explore.', 'Got It. Let’s Explore.'],
  ['Back to the flight', 'Back to the Flight'], ['Apply map style', 'Apply Map Style'],
  ['FRESHLY BREWED & READY TO SHARE', 'Freshly Brewed & Ready to Share'], [' A WORLD OF BREWING', ' A World of Brewing'],
  ['Challenge link copied', 'Challenge Link Copied'], ['Copy challenge link', 'Copy Challenge Link'],
  ['Play your challenge', 'Play Your Challenge'], ['Challenge name', 'Challenge Name'], ['Crew name', 'Crew Name'],
  ['Brewery region', 'Brewery Region'], ['Your challenge, your map rules', 'Your Challenge, Your Map Rules'],
  ['Publish challenge', 'Publish Challenge'], ['Create a crew challenge', 'Create a Crew Challenge'],
  ['Third-party licenses', 'Third-Party Licenses'], ['Download the launch catalog', 'Download the Launch Catalog'],
];

export function titleCaseBundle(s, file) {
  for (const [from, to] of TITLE_CASE) {
    const literal = '`' + from + '`';
    if (!s.includes(literal)) throw new Error(`Title case: "${from}" not found in ${file}.`);
    s = s.split(literal).join('`' + to + '`');
  }
  return s;
}

export function titleCaseHtml(html) {
  const esc = (t) => t.replace(/&/g, '&amp;');
  for (const [from, to] of TITLE_CASE) {
    // Only whole text nodes, so attribute values and longer sentences are untouched.
    html = html.split('>' + esc(from) + '<').join('>' + esc(to) + '<');
  }
  return html;
}

// Bundle patches -----------------------------------------------------------------------------

export function featurePatches({ base, replaceOnce, root, file }) {
  // Root-relative here; the build's final URL pass adds the deploy base to every root-relative literal.
  const components = readFileSync(join(root, 'pages/components.js'), 'utf8').split('__MT_BASE__').join('/');
  return (s) => {
    // Components at module scope, ahead of a known top-level statement.
    s = replaceOnce(s, 'pe.displayName=`BrewGlobe`;', components + '\npe.displayName=`BrewGlobe`;', file);

    // Practice: place filter replaces the country select.
    s = replaceOnce(
      s,
      '(0,O.jsxs)(`label`,{className:`field`,children:[(0,O.jsx)(`span`,{children:`Pick your patch`}),(0,O.jsxs)(`select`,{value:B,onChange:e=>V(e.target.value),children:[(0,O.jsx)(`option`,{children:`World`}),he.map(e=>(0,O.jsx)(`option`,{children:e},e))]})]})',
      '(0,O.jsx)(MtPlace,{value:B,onChange:V,practice:!0})',
      file,
    );
    // Atlas: place filter, matching, and search across region too.
    s = replaceOnce(
      s,
      '(0,O.jsxs)(`label`,{className:`field`,children:[(0,O.jsx)(`span`,{children:`Where in the world?`}),(0,O.jsxs)(`select`,{value:B,onChange:e=>{V(e.target.value),U(null)},children:[(0,O.jsx)(`option`,{children:`World`}),Object.keys(A.coverage).map(e=>(0,O.jsx)(`option`,{children:e},e))]})]})',
      '(0,O.jsx)(MtPlace,{value:B,onChange:e=>{V(e),U(null)}})',
      file,
    );
    s = replaceOnce(s, 'R.filter(e=>(B===`World`||e.country===B)&&', 'R.filter(e=>window.__mtMatch(e,B)&&', file);
    s = replaceOnce(s, '`${e.name} ${e.city} ${e.country}`.toLowerCase()', '`${e.name} ${e.city} ${e.region||``} ${e.country}`.toLowerCase()', file);
    s = replaceOnce(s, 'placeholder:`Brewery, city, country…`', 'placeholder:`Brewery, city, region, country…`', file);
    s = replaceOnce(s, '`${X.length.toLocaleString()} breweries found`', '`${X.length.toLocaleString()} brewer${X.length===1?`y`:`ies`} found`', file);
    s = replaceOnce(s, '`No breweries match. Try another name or country.`', '`No breweries match. Try another name or place.`', file);

    // GABF card on the atlas brewery card (on the globe) and on the round result.
    s = replaceOnce(
      s,
      '(0,O.jsxs)(`p`,{children:[H.city,`, `,H.country]}),',
      '(0,O.jsxs)(`p`,{children:[H.city,H.region?`, ${H.region}`:``,`, `,H.country]}),(0,O.jsx)(MtGabf,{g:H.gabf}),',
      file,
    );
    s = replaceOnce(
      s,
      '(0,O.jsxs)(`a`,{className:`source-link`,href:l.brewery.source,',
      '(0,O.jsx)(MtGabf,{g:l.brewery.gabf}),(0,O.jsxs)(`a`,{className:`source-link`,href:l.brewery.source,',
      file,
    );

    // Globe: finer cap tessellation closes the gaps where large country fills dipped below the
    // sphere; country names as HTML labels; zoom drives label density.
    s = replaceOnce(s, '.polygonAltitude(.001)', '.polygonAltitude(.001).polygonCapCurvatureResolution(1.5)', file);
    s = replaceOnce(
      s,
      '.pointOfView({lat:28,lng:12,altitude:2.1});let l=c.globeMaterial()',
      '.pointOfView({lat:28,lng:12,altitude:2.1});window.__mtGlobe=c;c.onZoom(e=>window.__mtZoom?.(e));let l=c.globeMaterial()',
      file,
    );
    s = replaceOnce(
      s,
      '.labelsData(r)},[e,g])',
      '.labelsData(r),t.htmlElementsData(window.__mtCountryLabels?.(n)||[]).htmlElement(e=>e.el).htmlElementVisibilityModifier(()=>{}).htmlAltitude(.005).htmlTransitionDuration(0)},[e,g])',
      file,
    );
    return s;
  };
}

// Styles -------------------------------------------------------------------------------------

export function featureCss(features) {
  let css = `
.mt-place{border:0;padding:0;margin:16px 0 0;min-width:0;width:100%}
.mt-place legend{font-size:12px;font-weight:600;color:#3d4a37;margin-bottom:8px;padding:0}
.mt-place-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.mt-place .field{min-width:0}
.mt-place .field{margin:0}
.mt-place select{width:100%;min-width:0;max-width:100%;min-height:44px;text-overflow:ellipsis}
.mt-place select:disabled{opacity:.6}
.mt-gabf{margin:12px 0 4px;padding:12px 14px;border:1px solid #d9cfae;border-radius:8px;background:#fbf7ea;color:#3d3a2a;width:100%}
.mt-gabf-title{font-size:11px;font-weight:700;letter-spacing:.3px;color:#5e5230}
.mt-gabf-medals{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 6px}
.mt-medal{font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid}
.mt-medal b{font-weight:700}
.mt-gold{background:#f6e7b4;border-color:#c9a43c;color:#4a3a08}
.mt-silver{background:#eceeef;border-color:#a7adb3;color:#33383d}
.mt-bronze{background:#f2dcc9;border-color:#b97f52;color:#4d2c12}
.mt-gabf p{font-size:12px;color:#5b5641;margin:0 0 6px}
.mt-gabf a{font-size:12px;font-weight:600;color:#32604c;text-decoration:underline;text-underline-offset:2px;display:inline-flex;align-items:center;min-height:24px}
.atlas-popover .mt-gabf{margin-top:8px}
.mt-country{pointer-events:none;font:600 11px/1.1 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f3326;white-space:nowrap;transform:translate(-50%,-50%);text-shadow:0 0 2px #dbe6c9,0 0 3px #dbe6c9,0 0 4px #dbe6c9}
.mt-country.mt-r1,.mt-country.mt-r2{font-size:13px}
.mt-country.mt-r3{font-size:12px}
.mt-country.mt-minor,.mt-country.mt-detail{display:none}
html[data-mt-zoom="mid"] .mt-country.mt-minor,html[data-mt-zoom="near"] .mt-country.mt-minor,html[data-mt-zoom="near"] .mt-country.mt-detail{display:block}
html.mt-imagery .mt-country{color:#fffaf0;text-shadow:0 0 2px #10180f,0 0 3px #10180f,0 1px 4px #10180f}
/* Bug fix (phones): the one-column game grid used 1fr, whose minimum is the content width, so
   the globe canvas pushed the card past the right edge. */
@media (max-width:650px){.game-stage{grid-template-columns:minmax(0,1fr)}}
/* With the 11px label floor the three phone stats no longer fit on one line at a 32px gap. */
@media (max-width:650px){.flight-stats{gap:12px;justify-content:space-between}.flight-stats>div{min-width:0}.flight-stats span{white-space:normal}}
.game-panel,.globe-stage,.globe-canvas{min-width:0}
/* The static site has no accounts; the server-rendered Sign In link would flash before load. */
.site-header .sign-in{display:none!important}
/* Title case reads poorly with the wide tracking the all-caps eyebrows used. */
.eyebrow,.page-top .eyebrow,.feature-card .eyebrow,.panel-eyebrow,.globe-top>span,.progress-label strong,.flight-total>span,.globe-stamp span{letter-spacing:.3px!important}
`;
  if (!features.crew) {
    // The Crew is hidden: its nav entry, the profile button that opens it, and its feature card.
    css += `
.site-header nav button:nth-of-type(4),.profile-btn{display:none!important}
.feature-card:not(.atlas-card){display:none!important}
.feature-card.atlas-card{grid-column:1/-1}
`;
  }
  return css;
}
