'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const landing = path.join(repo, 'Backend_server', 'public');
const admin = path.join(repo, 'Backend_server', 'admin');
const backend = path.join(repo, 'Backend_server');
const editor = path.join(repo, 'WebMapEditor');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function resolveRequest(urlPath) {
  if (urlPath === '/health') return null;
  if (urlPath === '/editor' || urlPath.startsWith('/editor/')) {
    const relative = (urlPath === '/editor' || urlPath === '/editor/')
      ? 'index.html'
      : urlPath.slice('/editor/'.length);
    return path.join(editor, relative);
  }
  if (urlPath.startsWith('/admin/')) return path.join(admin, urlPath.slice('/admin/'.length));
  if (urlPath.startsWith('/js/')) return path.join(backend, urlPath.slice(1));
  if (urlPath.startsWith('/css/')) return path.join(landing, urlPath.slice(1));
  const clean = urlPath.replace(/^\/+/, '');
  if (!clean) return path.join(landing, 'index.html');
  const direct = path.join(landing, clean);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  return path.join(landing, clean, 'index.html');
}

http.createServer((request, response) => {
  const urlPath = new URL(request.url, 'http://127.0.0.1').pathname;
  if (urlPath === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    return response.end('ok');
  }
  const file = resolveRequest(urlPath);
  const normalized = path.normalize(file || '');
  if (!file || !normalized.startsWith(repo) || !fs.existsSync(normalized) || fs.statSync(normalized).isDirectory()) {
    response.writeHead(404, { 'content-type': 'text/plain' });
    return response.end('Not found');
  }
  response.writeHead(200, {
    'content-type': types[path.extname(normalized)] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  fs.createReadStream(normalized).pipe(response);
}).listen(4178, '127.0.0.1', () => console.log('E2E_SERVER_READY'));
