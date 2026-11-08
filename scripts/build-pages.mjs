// Builds the static GitHub Pages edition of MapTap.beer into ./site.
//
// Input is the prebuilt release in ./release: the client assets, the rendered HTML for each
// page, and the brewery game module from the Worker bundle. The build copies those assets,
// injects the in-browser API shim, and rewrites root-relative URLs for the deploy base path.
//
// Usage: node scripts/build-pages.mjs [--base /repo-name/]
// The base defaults to $PAGES_BASE, then "/". It must start and end with "/".
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildData, countryLabels, featureCss, featurePatches, readFeatures, titleCaseBundle, titleCaseHtml } from './features.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = join(root, 'release');
const out = join(root, 'site');

const argBase = process.argv.indexOf('--base');
let base = (argBase > -1 ? process.argv[argBase + 1] : process.env.PAGES_BASE) || '/';
if (!base.startsWith('/')) base = '/' + base;
if (!base.endsWith('/')) base += '/';

const BORDER_ATLAS = '#4a6650';
const BORDER_IMAGERY = 'rgba(255,248,228,0.85)';
const AUTO_ADVANCE_MS = 5000;

const sep = (extra = '') => '(0,O.jsx)(`span`,{className:`legend-sep' + extra + '`,children:`·`})';
const item = (text, extra = '') => '(0,O.jsx)(`span`,{className:`mt-li' + extra + '`,children:`' + text + '`})';
const LEGEND_BUNDLE_FROM =
  '`Drag to explore `,' + sep() + ',` Scroll to zoom`,Z&&(0,O.jsxs)(O.Fragment,{children:[' + sep() + ',` Tap to pin`]})';
const LEGEND_BUNDLE_TO =
  item('Drag to Explore') + ',' + sep(' mt-zoom') + ',' + item('Scroll to Zoom', ' mt-zoom') +
  ',Z&&(0,O.jsxs)(O.Fragment,{children:[' + sep() + ',(0,O.jsx)(`span`,{className:`mt-li`,children:window.__mtPhone?.()?`Tap to Guess`:`Tap to Pin`})]})';
// The server-rendered HTML must match the bundle's first render.
const LEGEND_HTML_FROM = 'Drag to explore <span class="legend-sep">·</span> Scroll to zoom</div>';
const LEGEND_HTML_TO =
  '<span class="mt-li">Drag to Explore</span><span class="legend-sep mt-zoom">·</span><span class="mt-li mt-zoom">Scroll to Zoom</span></div>';

// WCAG AA: mid-tone text colours declared for light surfaces are darkened, keeping hue and
// saturation, until they reach the target against the darkest light surface in the design.
// Light colours (meant for dark surfaces) and the logotype are left alone.
const SURFACE = [236, 240, 224]; // darkest light panel colour used behind text
const TEXT_TARGET = 4.6;
const GRAPHIC_TARGET = 3.1;
const channel = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const hexToRgb = (h) => {
  h = h.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const rgbToHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
function darkenTo(hex, target) {
  let rgb = hexToRgb(hex);
  for (let i = 0; i < 100 && contrast(rgb, SURFACE) < target; i++) rgb = rgb.map((v) => v * 0.97);
  return rgbToHex(rgb);
}
export function fixContrast(css) {
  const changes = [];
  const out = css.replace(/([^{}]*)\{([^{}]*)\}/g, (rule, selector, body) => {
    if (/brand-dot|::placeholder/.test(selector)) return rule;
    const graphic = /svg|icon|seal/.test(selector.replace(/:not\([^)]*\)/g, ''));
    const next = body.replace(/(^|;)color:(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})(?=;|$)/g, (m, lead, hex) => {
      const rgb = hexToRgb(hex);
      if (luminance(rgb) > 0.6) return m;
      const target = graphic ? GRAPHIC_TARGET : TEXT_TARGET;
      if (contrast(rgb, SURFACE) >= target) return m;
      const fixed = darkenTo(hex, target);
      changes.push(`${selector.trim().slice(-50)}: ${hex} -> ${fixed}`);
      return `${lead}color:${fixed}`;
    });
    // Readability floor: no text below 11px (10px inside the compact progress steps). The
    // decorative stamp is exempt; it is hidden on phones instead.
    const floor = /\.round\b/.test(selector) ? 10 : 11;
    const sized = /globe-stamp/.test(selector)
      ? next
      : next.replace(/(^|;)font-size:(\d+(?:\.\d+)?)px/g, (m, lead, px) => {
          if (+px >= floor) return m;
          changes.push(`${selector.trim().slice(-50)}: font-size ${px}px -> ${floor}px`);
          return `${lead}font-size:${floor}px`;
        });
    return `${selector}{${sized}}`;
  });
  // Focus ring: amber at 3:1 on paper and 2.3:1 beside the green buttons; use the ink colour.
  return { css: out.split('outline-offset:4px;outline:3px solid #bc863b').join('outline-offset:3px;outline:3px solid #243b32'), changes };
}

// Styles for the static edition: globe mount, phone auto-advance countdown, and text that sits
// on translucent overlays or uses opacity (the colour pass above cannot see those).
const EXTRA_CSS = `
.mt-globe-mount{position:absolute;inset:0}
/* Bug fix: a background transition made new result buttons start transparent (unreadable). */
.primary-btn{transition:transform .15s}
/* Bug fix: the CSS reset removed the margin that centres native dialogs. */
dialog.modal{margin:auto;overflow:auto}
.round,.round>span{background:var(--white)}
.globe-legend{flex-wrap:wrap;row-gap:2px}
.globe-legend .legend-sep:last-child{display:inline}
.mt-li{white-space:nowrap}
.progress-label strong{letter-spacing:.6px;line-height:1.45}
@media (min-width:1101px){.progress-label{max-width:175px}}
@media (pointer:coarse){.globe-legend .mt-zoom{display:none}}
@media (max-width:850px){.help-btn{display:inline-block}}
@media (max-width:650px){.globe-stamp{display:none}}
@media (pointer:coarse){
.zoom-controls button{width:44px;height:44px}
.help-btn,.profile-btn,.globe-top button,.how-link,.text-btn,.source-link{min-height:44px;min-width:44px}
.site-footer a,.site-footer button,footer a,footer button{min-height:44px;display:inline-flex;align-items:center}
}
.mt-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.mt-auto{position:relative;overflow:hidden}
.mt-auto::after{content:"";position:absolute;left:0;bottom:0;height:4px;width:100%;background:currentColor;opacity:.55;transform-origin:left;animation:mt-countdown var(--mt-auto,5s) linear forwards}
@keyframes mt-countdown{from{transform:scaleX(0)}to{transform:scaleX(1)}}
`;

function replaceOnce(text, from, to, file, { optional = false, all = false } = {}) {
  const count = text.split(from).length - 1;
  if (!count) {
    if (optional) return text;
    throw new Error(`Expected "${from}" in ${file}, found none. The release bundle may have changed.`);
  }
  if (count > 1 && !all) throw new Error(`Expected one "${from}" in ${file}, found ${count}.`);
  return text.split(from).join(to);
}

function edit(path, fn) {
  writeFileSync(path, fn(readFileSync(path, 'utf8'), path));
}

function findChunk(prefix) {
  const dir = join(out, '_next/static/chunks');
  const name = readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith('.js'));
  if (!name) throw new Error(`Missing chunk ${prefix}*.js`);
  return join(dir, name);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(release, 'client'), out, { recursive: true });
mkdirSync(join(out, 'local-api'), { recursive: true });
cpSync(join(release, 'game.js'), join(out, 'local-api/game.js'));
cpSync(join(root, 'pages/local-api.mjs'), join(out, 'local-api/local-api.mjs'));
writeFileSync(
  join(out, 'fetch-shim.js'),
  readFileSync(join(root, 'pages/fetch-shim.js'), 'utf8').replace('/*__COUNTRY_LABELS__*/[]', JSON.stringify(countryLabels(release))),
);
const features = readFeatures(root);
const data = buildData(release, out);
console.log(`Data: ${data.breweries} breweries, ${data.medalists} with GABF medals; The Crew ${features.crew ? 'on' : 'off'}`);
// Serve every file as-is: no Jekyll processing, which would hide the _next directory.
writeFileSync(join(out, '.nojekyll'), '');
if (existsSync(join(root, 'CNAME'))) cpSync(join(root, 'CNAME'), join(out, 'CNAME'));

const copy = [
  ['Your signed-in score is saved.', 'Your score is saved in this browser.'],
  [
    'A shareable challenge is saved to your account. No API keys required.',
    'The crew link carries the challenge, so anyone with it plays the same flight.',
  ],
  [
    'People opening the link need permission to visit this site. Site access is currently private.',
    'Anyone with the link plays the same five breweries. Each player’s score stays in their own browser.',
  ],
];

// App bundle: root-relative asset, API and navigation URLs gain the base path.
edit(findChunk('brewtap-'), (s, file) => {
  // There is no account on the static site: drop Sign out, and say where progress lives.
  s = replaceOnce(s, '(0,O.jsx)(`a`,{href:`/signout-with-chatgpt?return_to=%2F`,target:`_top`,children:`Sign out`})', 'null', file);
  s = replaceOnce(s, '(0,O.jsx)(`small`,{children:L.email})', '(0,O.jsx)(`small`,{children:`Progress saved in this browser`})', file);
  s = s.replace(/`\/sign(?:in|out)-with-chatgpt\?return_to=[^`]*`/g, '`/`');
  s = replaceOnce(s, '${location.origin}/?challenge=', '${location.origin}' + base + '?challenge=', file);
  s = replaceOnce(s, '\\n${location.origin}`', '\\n${location.origin}' + base + '`', file);
  for (const [from, to] of copy) s = replaceOnce(s, from, to, file);
  // Bug fix: globe.gl clears its container (innerHTML = '') on init. The container is the
  // React-managed .globe-wrap, so React's later removal of the loading message threw
  // NotFoundError and the root error boundary replaced the whole page. Mount the globe in its
  // own child element instead.
  // The class name must not collide with the app's own .globe-canvas wrapper.
  s = replaceOnce(
    s,
    'let s=d.current,c=new i(s,',
    'let s=d.current.querySelector(`.mt-globe-mount`)||d.current.appendChild(Object.assign(document.createElement(`div`),{className:`mt-globe-mount`})),c=new i(s,',
    file,
  );

  // Darker country borders: dark green on the atlas, warm white over satellite and night imagery.
  s = replaceOnce(s, '.polygonStrokeColor(()=>`#dae5c7`)', '.polygonStrokeColor(()=>`' + BORDER_ATLAS + '`)', file);
  s = replaceOnce(
    s,
    '.polygonStrokeColor(()=>e.borders?`#dae5c7`:`rgba(0,0,0,0)`)',
    '.polygonStrokeColor(()=>e.borders?(n?`' + BORDER_ATLAS + '`:`' + BORDER_IMAGERY + '`):`rgba(0,0,0,0)`)',
    file,
  );

  // Phone play: a tap on the globe places the pin and locks it in at once. After the result,
  // the flight advances by itself; the Next button shows the countdown and still works early.
  s = replaceOnce(
    s,
    'async function We(){if(!(!d||!s||D)){k(!0),P(``);try{let e=await j(`/api/guess`,{id:s.id,round:s.round,...d});u(e.result),c(e.game)}',
    'async function We(x){let q=x&&typeof x.lat==`number`?x:d;if(!(!q||!s||D)){k(!0),P(``);try{let e=await j(`/api/guess`,{id:s.id,round:s.round,lat:q.lat,lng:q.lng});u(e.result),c(e.game),window.__mtResult?.(e),window.__mtPhone?.()&&(clearTimeout(window.__mtT),window.__mtT=setTimeout(Ge,' + AUTO_ADVANCE_MS + '))}',
    file,
  );
  s = replaceOnce(s, 'function Ge(){u(null)', 'function Ge(){clearTimeout(window.__mtT),u(null)', file);
  s = replaceOnce(s, 'function Q(e){t(e)', 'function Q(e){clearTimeout(window.__mtT),t(e)', file);
  s = replaceOnce(s, 'onPin:f,active:Z', 'onPin:e=>{f(e),window.__mtPhone?.()&&We(e)},active:Z', file);
  s = replaceOnce(
    s,
    '(`button`,{className:`primary-btn full`,onClick:Ge,',
    '(`button`,{className:`primary-btn full`+(window.__mtPhone?.()?` mt-auto`:``),style:{"--mt-auto":`' + AUTO_ADVANCE_MS + 'ms`},onClick:Ge,',
    file,
  );
  // Phone copy: a tap is final, so say so before the player taps.
  s = replaceOnce(
    s,
    ':`Rotate the globe and drop your pin.`',
    ':window.__mtPhone?.()?`Rotate the globe, then tap once to lock in your guess.`:`Rotate the globe and drop your pin.`',
    file,
  );
  // Globe legend: one element per hint so phones can wrap cleanly and drop "Scroll to zoom".
  s = replaceOnce(s, LEGEND_BUNDLE_FROM, LEGEND_BUNDLE_TO, file);

  s = featurePatches({ base, replaceOnce, root, file })(s);
  s = titleCaseBundle(s, file);

  // Last: every remaining root-relative literal (assets, API, navigation) gains the base path.
  s = s.replace(/`\/(?=[a-z?`])/g, '`' + base);
  return s;
});

// Vite preload helper resolves dynamic chunk paths against the base.
edit(findChunk('index-'), (s, file) => replaceOnce(s, 'function(e){return`/`+e}', 'function(e){return`' + base + '`+e}', file));

for (const css of readdirSync(join(out, '_next/static/css'))) {
  edit(join(out, '_next/static/css', css), (s) => {
    const fixed = fixContrast(s.replace(/url\(\/(?!\/)/g, 'url(' + base));
    if (process.env.CONTRAST_REPORT) console.log(fixed.changes.join('\n'));
    console.log(`Accessibility pass: ${fixed.changes.length} colour and font-size adjustments in ${css}`);
    return fixed.css + EXTRA_CSS + featureCss(features);
  });
}

function page(html, file) {
  let s = html;
  // Attributes and the inline RSC payload (escaped JSON strings) both carry asset URLs.
  s = s.replace(/(\\?")\/(_next\/|favicon\.svg)/g, '$1' + base + '$2');
  s = s.replace(/href="\/sign(?:in|out)-with-chatgpt\?return_to=[^"]*"/g, 'href="' + base + '"');
  s = s.replace(/href="\/"/g, 'href="' + base + '"');
  if (file === 'index.html') s = replaceOnce(s, LEGEND_HTML_FROM, LEGEND_HTML_TO, file);
  s = titleCaseHtml(s);
  s = replaceOnce(s, '<html lang="en">', `<html lang="en" data-base="${base}">`, file);
  s = replaceOnce(s, '<meta charSet="utf-8"/>', `<meta charSet="utf-8"/><script src="${base}fetch-shim.js"></script>`, file);
  const left = (s.match(/(?:href|src)=\\?"\/(?!\/)[^"\\]*/g) || []).filter((m) => !m.split('"')[1].startsWith(base));
  if (left.length) throw new Error(`Unrewritten root-relative URL in ${file}: ${left.join(', ')}`);
  return s;
}

const pages = [
  ['index.html', 'index.html'],
  ['licenses.html', 'licenses.html'],
  ['404.html', '404.html'],
];
for (const [src, dest] of pages) {
  writeFileSync(join(out, dest), page(readFileSync(join(release, 'html', src), 'utf8'), src));
}

console.log(`Built ${out} for base ${base}`);
