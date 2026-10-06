// Renders scene.html in headless Chrome. Usage: node render.js stills 0 0.5 1.2  |  node render.js video
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const http = require('http');
const root = __dirname;
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(root, u), (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(u)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8765);
(async () => {
  const [mode, ...rest] = process.argv.slice(2);
  const w = +(process.env.W || 1080), h = +(process.env.H || 2346), fps = 60;
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${w},${h}`],
    defaultViewport: { width: w, height: h, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  page.on('console', (m) => console.log('page:', m.text()));
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(`http://localhost:8765/scene.html?w=${w}&h=${h}`);
  await page.waitForFunction('window.sceneReady === true', { timeout: 60000 });
  console.log('gpu:', await page.evaluate(() => { const gl = document.querySelector('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; }));
  const dur = await page.evaluate(() => window.DURATION);
  const out = path.join(root, mode === 'video' ? 'frames' : 'stills');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const times = mode === 'video' ? Array.from({ length: Math.round(dur * fps) + 1 }, (_, i) => i / fps) : rest.map(Number);
  const t0 = Date.now();
  for (let i = 0; i < times.length; i++) {
    const url = await page.evaluate((t, png) => window.renderAt(t, png ? 'png' : 0.95), times[i], mode === 'video');
    const name = mode === 'video' ? `f_${String(i).padStart(4, '0')}.png` : `t_${times[i].toFixed(2)}.jpg`;
    fs.writeFileSync(path.join(out, name), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log(`rendered ${times.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
