// node measure.js file.bmp → background colour + bounding box of pixels that differ from it
const fs = require('fs');
const b = fs.readFileSync(process.argv[2]);
const off = b.readUInt32LE(10), w = b.readInt32LE(18), h0 = b.readInt32LE(22), bpp = b.readUInt16LE(28) / 8;
const h = Math.abs(h0), row = Math.ceil((w * bpp) / 4) * 4;
const px = (x, y) => { const r = h0 > 0 ? h - 1 - y : y; const i = off + r * row + x * bpp; return [b[i + 2], b[i + 1], b[i]]; };
const bg = px(20, 20);
let x0 = w, x1 = -1, y0 = h, y1 = -1;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const p = px(x, y);
  if (Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 24) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
}
const hex = (p) => p.map((v) => v.toString(16).padStart(2, '0')).join('');
console.log(`size ${w}x${h} bg #${hex(bg)} | subject x ${x0}-${x1} (w ${x1 - x0 + 1}) y ${y0}-${y1} (h ${y1 - y0 + 1}) centre (${(x0 + x1) / 2}, ${(y0 + y1) / 2})`);
