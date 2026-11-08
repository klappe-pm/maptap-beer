// Serves ./site the way GitHub Pages does, under a base path, for local checks.
// Usage: node scripts/serve-pages.mjs [--base /maptap-beer/] [--port 4173]
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('../site/', import.meta.url));
const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const base = arg('--base', '/');
const port = Number(arg('--port', '4173'));
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/json',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
};

function resolve(path) {
  const file = normalize(join(site, path));
  if (!file.startsWith(site)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) return existsSync(join(file, 'index.html')) ? join(file, 'index.html') : null;
  if (existsSync(file)) return file;
  if (existsSync(file + '.html')) return file + '.html';
  return null;
}

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const file = pathname.startsWith(base) ? resolve(decodeURIComponent(pathname.slice(base.length))) : null;
  const target = file || join(site, '404.html');
  res.writeHead(file ? 200 : 404, { 'Content-Type': types[extname(target)] || 'application/octet-stream' });
  res.end(readFileSync(target));
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}${base}`));
