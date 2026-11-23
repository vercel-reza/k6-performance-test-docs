// Preview lokal yang meniru perilaku static hosting Vercel untuk folder public/.
// Aturan: /<path> -> <path>/index.html, /<path>.html -> <path>.html, aset di-cache immutable.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT || 3000);
const IMMUTABLE = /^\/_mintlify\/(?:assets|export-assets)\//;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.json': 'application/json', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.xml': 'application/xml',
};

function resolveFile(urlPath) {
  const base = path.resolve(DIR, urlPath.replace(/^\/+/, ''));
  if (base !== DIR && !base.startsWith(DIR + path.sep)) return undefined;
  const candidates = [base, path.join(base, 'index.html'), base + '.html', path.join(base, 'index')];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
}

http.createServer((req, res) => {
  const rawPath = (req.url || '/').split('?')[0];
  let urlPath;
  try {
    urlPath = decodeURIComponent(rawPath);
  } catch {
    res.writeHead(400).end('400 Bad Request');
    return;
  }
  const file = resolveFile(urlPath);
  if (!file) {
    const notFound = path.join(DIR, '404.html');
    if (fs.existsSync(notFound)) {
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      fs.createReadStream(notFound).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 Not Found');
    }
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': IMMUTABLE.test(urlPath) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
  });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`preview: http://localhost:${PORT}`));
