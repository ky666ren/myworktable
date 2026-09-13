// 简易静态服务器 + WebDAV 代理：node server.js [port]
// /dav-proxy：浏览器跨域受限时，把 WebDAV 请求转发到 X-Dav-Url 指定的地址
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const port = Number(process.argv[2]) || 8123;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function proxy(req, res) {
  // 目标优先级：查询参数 url（兼容 Cloudflare Worker 的 ?url= 调用契约）> X-Dav-Url 头
  let target = null;
  try { target = new URL(req.url, 'http://x').searchParams.get('url') || req.headers['x-dav-url']; } catch (e) {}
  if (!target) { res.writeHead(400); return res.end('missing url'); }
  let u;
  try { u = new URL(target); } catch (e) { res.writeHead(400); return res.end('bad target'); }
  const mod = u.protocol === 'https:' ? https : http;
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const preq = mod.request(u, {
      method: req.method,
      headers: {
        'Authorization': req.headers['authorization'] || '',
        'Content-Type': req.headers['content-type'] || 'application/json',
        'Depth': req.headers['depth'] || '0',
        'Content-Length': Buffer.byteLength(Buffer.concat(chunks)),
      },
    }, pres => {
      res.writeHead(pres.statusCode || 502, { 'Access-Control-Allow-Origin': '*' });
      pres.pipe(res);
    });
    preq.on('error', err => { res.writeHead(502, { 'Access-Control-Allow-Origin': '*' }); res.end(String(err)); });
    preq.end(Buffer.concat(chunks));
  });
}

http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/dav-proxy') return proxy(req, res);
  let file = path.join(root, p === '/' ? '/index.html' : p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`SideQuest dev server: http://localhost:${port}`));
