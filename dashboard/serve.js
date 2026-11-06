// Tiny static server so the page can fetch ../data/*.json. Run: node dashboard/serve.js  ->  http://localhost:8080
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), PORT = process.env.PORT || 8080;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') return res.writeHead(302, { Location: '/dashboard/' }).end();
  let file = path.join(root, url.endsWith('/') ? url + 'index.html' : url);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (err, buf) => err ? res.writeHead(404).end('Not found') : res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(buf));
}).listen(PORT, () => console.log(`http://localhost:${PORT}/dashboard/`));
