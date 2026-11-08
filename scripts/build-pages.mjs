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

const root = fileURLToPath(new URL('../', import.meta.url));
const release = join(root, 'release');
const out = join(root, 'site');

const argBase = process.argv.indexOf('--base');
let base = (argBase > -1 ? process.argv[argBase + 1] : process.env.PAGES_BASE) || '/';
if (!base.startsWith('/')) base = '/' + base;
if (!base.endsWith('/')) base += '/';

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
cpSync(join(root, 'pages/fetch-shim.js'), join(out, 'fetch-shim.js'));
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
  s = s.replace(/`\/(?=[a-z?`])/g, '`' + base);
  for (const [from, to] of copy) s = replaceOnce(s, from, to, file);
  // Bug fix: globe.gl clears its container (innerHTML = '') on init. The container is the
  // React-managed .globe-wrap, so React's later removal of the loading message threw
  // NotFoundError and the root error boundary replaced the whole page. Mount the globe in its
  // own child element instead.
  s = replaceOnce(
    s,
    'let s=d.current,c=new i(s,',
    'let s=d.current.querySelector(`.globe-canvas`)||d.current.appendChild(Object.assign(document.createElement(`div`),{className:`globe-canvas`})),c=new i(s,',
    file,
  );
  return s;
});

// Vite preload helper resolves dynamic chunk paths against the base.
edit(findChunk('index-'), (s, file) => replaceOnce(s, 'function(e){return`/`+e}', 'function(e){return`' + base + '`+e}', file));

for (const css of readdirSync(join(out, '_next/static/css'))) {
  edit(join(out, '_next/static/css', css), (s) => s.replace(/url\(\/(?!\/)/g, 'url(' + base) + '.globe-canvas{position:absolute;inset:0}\n');
}

function page(html, file) {
  let s = html;
  // Attributes and the inline RSC payload (escaped JSON strings) both carry asset URLs.
  s = s.replace(/(\\?")\/(_next\/|favicon\.svg)/g, '$1' + base + '$2');
  s = s.replace(/href="\/sign(?:in|out)-with-chatgpt\?return_to=[^"]*"/g, 'href="' + base + '"');
  s = s.replace(/href="\/"/g, 'href="' + base + '"');
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
