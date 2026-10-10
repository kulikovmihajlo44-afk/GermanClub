// Local stand-in for Vercel: static files + /api/* handlers + in-memory Postgres (PGlite). For testing only.
const http = require('http'), fs = require('fs'), path = require('path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const db = require(root + '/lib/db');
const pg = new PGlite();
db.setClient({ query: async (t, p) => (await pg.query(t, p)).rows });
process.env.DATABASE_URL = process.env.DATABASE_URL || 'test';
const routes = { '/api/app': 'app', '/apply': 'apply', '/api/apply': 'apply', '/api/login': 'login', '/api/logout': 'logout', '/api/me': 'me', '/api/settings': 'settings', '/api/admin': 'admin' };
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let p = u.pathname;
  if (routes[p]) {
    let data = ''; req.on('data', (c) => data += c); req.on('end', () => {
      const ct = req.headers['content-type'] || '';
      req.body = data ? (ct.includes('json') ? JSON.parse(data) : data) : undefined;
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (j) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(j)); };
      require(root + '/api/' + routes[p] + '.js')(req, res);
    }); return;
  }
  // same redirects / rewrites / clean URLs as production (read from vercel.json)
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  for (const r of cfg.redirects || []) if (r.source === p) { const loc = r.destination.includes('?') && u.search ? r.destination + '&' + u.search.slice(1) : r.destination + (r.destination.includes('?') ? '' : u.search); res.statusCode = 307; res.setHeader('Location', loc); return res.end(); }
  for (const r of cfg.rewrites || []) { const m = r.source.endsWith('/:path*') ? p.startsWith(r.source.slice(0, -7) + '/') : r.source === p; if (m && !r.destination.startsWith('/api')) { p = r.destination; break; } }
  if (p === '/') p = '/index.html'; else if (!path.extname(p) && fs.existsSync(path.join(root, p + '.html'))) p += '.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
}).listen(8061, '127.0.0.1', () => console.log('dev server on http://127.0.0.1:8061'));
