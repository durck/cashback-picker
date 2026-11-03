// Static dev server with an explicit MIME table, so ES modules always load
// as JavaScript (some platform servers send .js as text/plain).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = normalize(decoded).replace(/^[/\\]+/, '');
  const full = resolve(join(ROOT, relative));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  return full;
}

async function fileFor(urlPath) {
  const full = resolvePath(urlPath);
  if (!full) return null;
  const info = await stat(full).catch(() => null);
  if (!info) return null;
  return info.isDirectory() ? join(full, 'index.html') : full;
}

const server = createServer(async (req, res) => {
  try {
    const file = await fileFor(req.url || '/');
    const body = file ? await readFile(file).catch(() => null) : null;
    if (!body) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Server error: ${error.message}`);
  }
});

server.listen(PORT, () => {
  process.stdout.write(`Serving ${ROOT} at http://localhost:${PORT}/\n`);
});
