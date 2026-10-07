// A detailed sport bike for the launch intro, built in code (no third-party model).
// Body coordinates: x forward, y up, z = the bike's right; origin on the ground midway between the tyres.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const WB = 1.43;
export const R_REAR = 0.32;
export const R_FRONT = 0.3;
const REAR = new THREE.Vector3(-WB / 2, R_REAR, 0);
const FRONT = new THREE.Vector3(WB / 2, R_FRONT, 0);
const RAKE = THREE.MathUtils.degToRad(24);
const FORK_DIR = new THREE.Vector3(-Math.sin(RAKE), Math.cos(RAKE), 0);
const FORK_LEN = 0.75;
const forkPoint = (u, z = 0) => FRONT.clone().addScaledVector(FORK_DIR, FORK_LEN * u).setZ(z);

const RED = new THREE.Color('#c8101c');
const BLACK = new THREE.Color('#0e0e10');
const WHITE = new THREE.Color('#f2f2f4');
// The livery, in side-profile coordinates: black belly under a line rising to the nose, a white edge, a black stripe.
const stripeLine = (x) => 0.3 + 0.343 * (x + 0.2);
function liveryColor(x, y) {
  const l = stripeLine(x);
  if (y < l) return BLACK;
  if (y < l + 0.014) return WHITE;
  if (y > l + 0.04 && y < l + 0.07) return BLACK;
  return RED;
}

// Livery texture for panel sides, mapped by side-profile position (x -1..1, y 0..1.25 m).
function liveryTexture(anisotropy) {
  const W = 2048, H = 1280, X0 = -1, Y1 = 1.25, ppm = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const px = (x) => (x - X0) * ppm, py = (y) => (Y1 - y) * ppm;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#d81822'); grad.addColorStop(1, '#a80b16');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  const band = (from, to, color) => {
    g.beginPath();
    g.moveTo(px(-1), py(stripeLine(-1) + from)); g.lineTo(px(1), py(stripeLine(1) + from));
    g.lineTo(px(1), py(stripeLine(1) + to)); g.lineTo(px(-1), py(stripeLine(-1) + to));
    g.closePath(); g.fillStyle = color; g.fill();
  };
  band(-2, 0, '#0e0e10');
  band(0, 0.014, '#f2f2f4');
  band(0.04, 0.07, '#0e0e10');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.repeat.set(1 / 2, 1 / 1.25);
  t.offset.set(0.5, 0);
  return t;
}

function shapeOf(cmds, divisions = 240) {
  const p = new THREE.Shape();
  for (const c of cmds) {
    if (c[0] === 'M') p.moveTo(c[1], c[2]);
    else if (c[0] === 'L') p.lineTo(c[1], c[2]);
    else if (c[0] === 'Q') p.quadraticCurveTo(c[1], c[2], c[3], c[4]);
  }
  p.closePath();
  const pts = p.getSpacedPoints(divisions);
  if (pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  return new THREE.Shape(pts);
}
function arcShape(cx, cy, r0, r1, a0, a1) {
  const s = new THREE.Shape();
  s.absarc(cx, cy, r1, a0, a1, false);
  s.absarc(cx, cy, r0, a1, a0, true);
  return new THREE.Shape(s.getSpacedPoints(120));
}
function slice(g, start, count) {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name];
    out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
  }
  return out;
}
// A body panel: the side profile extruded to ±halfW with rounded edges. Flat sides take
// `sides` (left/right materials); the rounded walls are smoothed and take `walls`
// (vertex-coloured with the livery when `livery` is set).
function panel(shape, halfW, { bevel = 0.025, segs = 5, sides, walls, livery = false, z = 0 }) {
  const depth = Math.max(2 * (halfW - bevel), 0.002);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, curveSegments: 1, steps: 1,
  });
  g.translate(0, 0, -depth / 2 + z);
  const [caps, wallsGroup] = g.groups;
  const half = caps.count / 2;
  const left = slice(g, caps.start, half), right = slice(g, caps.start + half, half);
  let w = slice(g, wallsGroup.start, wallsGroup.count);
  w.deleteAttribute('uv'); w.deleteAttribute('normal');
  w = mergeVertices(w, 1e-6);
  w.computeVertexNormals();
  if (livery) {
    const p = w.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) liveryColor(p.getX(i), p.getY(i)).toArray(col, i * 3);
    w.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const grp = new THREE.Group();
  const [sideL, sideR] = Array.isArray(sides) ? sides : [sides, sides];
  grp.add(new THREE.Mesh(left, sideL), new THREE.Mesh(right, sideR), new THREE.Mesh(w, walls));
  return grp;
}
// ---------- moulded body panels ----------
// Outline points of a side profile, counter-clockwise, evenly spaced.
function outlineOf(cmds, n) {
  const s = new THREE.Shape();
  for (const c of cmds) {
    if (c[0] === 'M') s.moveTo(c[1], c[2]);
    else if (c[0] === 'L') s.lineTo(c[1], c[2]);
    else if (c[0] === 'Q') s.quadraticCurveTo(c[1], c[2], c[3], c[4]);
  }
  s.closePath();
  const pts = s.getSpacedPoints(n);
  if (pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  return pts;
}
function blur1(src, w, h, sigma, horizontal) {
  const r = Math.ceil(sigma * 3), k = [];
  let ks = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); ks += v; }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) {
      const xx = horizontal ? Math.min(w - 1, Math.max(0, x + i)) : x, yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + i));
      acc += src[yy * w + xx] * k[i + r];
    }
    out[y * w + x] = acc / ks;
  }
  return out;
}
// Delaunay triangulation (Bowyer-Watson). Returns [i, j, k] index triples, counter-clockwise.
function delaunay(P) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of P) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const n = P.length, dm = Math.max(maxX - minX, maxY - minY) * 20, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const X = new Float64Array(n + 3), Y = new Float64Array(n + 3);
  P.forEach((p, i) => { X[i] = p.x; Y[i] = p.y; });
  X[n] = mx - dm; Y[n] = my - dm; X[n + 1] = mx; Y[n + 1] = my + dm; X[n + 2] = mx + dm; Y[n + 2] = my - dm;
  const tri = (a, b, c) => {
    if ((X[b] - X[a]) * (Y[c] - Y[a]) - (Y[b] - Y[a]) * (X[c] - X[a]) < 0) [b, c] = [c, b];
    const ax = X[a], ay = Y[a], bx = X[b], by = Y[b], cx = X[c], cy = Y[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    return { a, b, c, ux, uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  // insert in a coarse spatial order so each cavity stays small
  const order = [...Array(n).keys()].sort((i, j) => Math.floor(Y[i] * 40) - Math.floor(Y[j] * 40) || (Math.floor(Y[i] * 40) % 2 ? X[j] - X[i] : X[i] - X[j]));
  let tris = [tri(n, n + 1, n + 2)];
  for (const i of order) {
    const px = X[i], py = Y[i], keep = [], edges = new Map();
    for (const t of tris) {
      if ((px - t.ux) ** 2 + (py - t.uy) ** 2 < t.r2) {
        for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
          const key = u < v ? u * 1e6 + v : v * 1e6 + u;
          edges.set(key, edges.has(key) ? null : [u, v]);
        }
      } else keep.push(t);
    }
    for (const e of edges.values()) if (e) keep.push(tri(e[0], e[1], i));
    tris = keep;
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c]);
}
// A body panel as one smooth moulded shell rather than a flat-sided slab. From the side it's the
// profile; across, it rounds over from the outline (where both sides meet edge-on) to halfW at
// `round` metres in, then domes by `dome` towards the middle so reflections flow over it.
// Returns the mesh and zAt(x, y), how far the surface stands out from the centre plane.
function moulded(cmds, halfW, { round = 0.05, k = 2.4, dome = 0, domeR = 0.2, mat, n = 360, step = 0.012 }) {
  const out = outlineOf(cmds, n), N = out.length;
  const inN = out.map((b, i) => {
    const a = out[(i - 1 + N) % N], c = out[(i + 1) % N];
    const nx = -(c.y - a.y), ny = c.x - a.x, l = Math.hypot(nx, ny) || 1;
    return new THREE.Vector2(nx / l, ny / l);
  });
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = N - 1; i < N; j = i++) {
      const a = out[i], b = out[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const dist = (x, y) => {
    let best = Infinity;
    for (let i = 0; i < N; i++) {
      const a = out[i], b = out[(i + 1) % N], ex = b.x - a.x, ey = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / (ex * ex + ey * ey)));
      const dx = x - a.x - ex * t, dy = y - a.y - ey * t, d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of out) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }

  // Interior points: rings packed close to the edge, where the surface turns fastest, then a grid.
  const pts = [], cell = 0.004, bins = new Map();
  const binKey = (i, j) => i * 100003 + j;
  const near = (x, y, r) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), m = Math.ceil(r / cell);
    for (let i = -m; i <= m; i++) for (let j = -m; j <= m; j++) {
      const l = bins.get(binKey(cx + i, cy + j));
      if (l) for (const p of l) if ((p.x - x) ** 2 + (p.y - y) ** 2 < r * r) return true;
    }
    return false;
  };
  const put = (p) => { const key = binKey(Math.floor(p.x / cell), Math.floor(p.y / cell)); if (!bins.has(key)) bins.set(key, []); bins.get(key).push(p); };
  out.forEach(put);
  const RINGS = 8;
  for (let j = 1; j <= RINGS; j++) {
    const off = round * (j / RINGS) ** 1.8, prev = round * ((j - 1) / RINGS) ** 1.8;
    for (let i = 0; i < N; i++) {
      const x = out[i].x + inN[i].x * off, y = out[i].y + inN[i].y * off;
      if (!inside(x, y) || dist(x, y) < off * 0.75 || near(x, y, Math.max((off - prev) * 0.5, 0.0012))) continue;
      const p = new THREE.Vector2(x, y);
      pts.push(p);
      put(p);
    }
  }
  for (let x = minX + step / 2; x < maxX; x += step) for (let y = minY + step / 2; y < maxY; y += step) {
    if (!inside(x, y) || dist(x, y) < round * 0.95 || near(x, y, step * 0.6)) continue;
    const p = new THREE.Vector2(x, y);
    pts.push(p);
    put(p);
  }

  // The dome follows a blurred distance field (plain distance creases along the centre lines),
  // read back through a cubic B-spline so its slope is smooth as well.
  let domeAt = () => [0, 0, 0];
  if (dome > 0) {
    const g = 0.006, x0 = minX - 0.03, y0 = minY - 0.03;
    const gw = Math.ceil((maxX - minX + 0.06) / g) + 3, gh = Math.ceil((maxY - minY + 0.06) / g) + 3;
    let f = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = x0 + i * g, y = y0 + j * g;
      f[j * gw + i] = inside(x, y) ? Math.min(dist(x, y), domeR) / domeR : 0;
    }
    const sg = (domeR * 0.3) / g;
    f = blur1(blur1(f, gw, gh, sg, true), gw, gh, sg, false);
    const bs = (t) => [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6, (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];
    const dbs = (t) => [-((1 - t) ** 2) / 2, (3 * t * t - 4 * t) / 2, (-3 * t * t + 2 * t + 1) / 2, (t * t) / 2];
    const at = (i, j) => f[Math.min(gh - 1, Math.max(0, j)) * gw + Math.min(gw - 1, Math.max(0, i))];
    // the dome's height (0..1) and its slope per metre at (x, y)
    domeAt = (x, y) => {
      const fx = (x - x0) / g, fy = (y - y0) / g, i = Math.floor(fx), j = Math.floor(fy);
      const bx = bs(fx - i), by = bs(fy - j), dbx = dbs(fx - i), dby = dbs(fy - j);
      let v = 0, vx = 0, vy = 0;
      for (let q = 0; q < 4; q++) for (let r = 0; r < 4; r++) {
        const c = at(i - 1 + r, j - 1 + q);
        v += c * bx[r] * by[q];
        vx += c * dbx[r] * by[q];
        vy += c * bx[r] * dby[q];
      }
      const w = Math.min(1, v * 1.6);
      if (w >= 1) return [1, 0, 0];
      const k2 = (2 * (1 - w) * 1.6) / g;
      return [1 - (1 - w) ** 2, k2 * vx, k2 * vy];
    };
  }
  // The surface's height and slope at (x, y). The slope follows a softened nearest-edge direction,
  // so reflections run smoothly instead of rippling at every outline point.
  const surf = (x, y) => {
    let best = Infinity;
    const D = new Float64Array(N), QX = new Float64Array(N), QY = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = out[i], b = out[(i + 1) % N], ex = b.x - a.x, ey = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / (ex * ex + ey * ey)));
      const qx = a.x + ex * t, qy = a.y + ey * t, d = Math.hypot(x - qx, y - qy);
      D[i] = d; QX[i] = qx; QY[i] = qy;
      if (d < best) best = d;
    }
    let gx = 0, gy = 0;
    for (let i = 0; i < N; i++) {
      const e = D[i] - best;
      if (e > 0.02 || D[i] < 1e-9) continue;
      const w = Math.exp(-e / 0.003);
      gx += (w * (x - QX[i])) / D[i];
      gy += (w * (y - QY[i])) / D[i];
    }
    const gl = Math.hypot(gx, gy) || 1;
    gx /= gl; gy /= gl;
    const u = Math.min(best / round, 1), [dv, dvx, dvy] = domeAt(x, y);
    const P = (1 - (1 - u) ** k) ** (1 / k), E = u * u * (3 - 2 * u);
    let dhdd = 0;
    if (u < 1) {
      const Pp = u > 1e-6 ? (1 - (1 - u) ** k) ** (1 / k - 1) * (1 - u) ** (k - 1) : 1e6;
      dhdd = (halfW * Pp + dome * 6 * u * (1 - u) * dv) / round;
    }
    return { h: halfW * P + dome * E * dv, sx: dhdd * gx + dome * E * dvx, sy: dhdd * gy + dome * E * dvy };
  };

  const V = out.concat(pts), M = V.length, B = pts.length;
  // triangles that fall outside the profile (across a concave notch) are dropped
  const faces = delaunay(V).filter(([a, b, c]) => inside((V[a].x + V[b].x + V[c].x) / 3, (V[a].y + V[b].y + V[c].y) / 3));
  const pos = new Float32Array((M + B) * 3), nrm = new Float32Array((M + B) * 3), uv = new Float32Array((M + B) * 2);
  for (let i = 0; i < M; i++) {
    const { x, y } = V[i];
    uv.set([x, y], i * 2);
    if (i < N) {
      // along the outline the shell is edge-on, so the normal points straight out
      pos.set([x, y, 0], i * 3);
      nrm.set([-inN[i].x, -inN[i].y, 0], i * 3);
      continue;
    }
    const { h, sx, sy } = surf(x, y), l = Math.hypot(sx, sy, 1), j = M + i - N;
    pos.set([x, y, h], i * 3);
    nrm.set([-sx / l, -sy / l, 1 / l], i * 3);
    pos.set([x, y, -h], j * 3);
    nrm.set([-sx / l, -sy / l, -1 / l], j * 3);
    uv.set([x, y], j * 2);
  }
  const back = (i) => (i < N ? i : M + i - N);
  const idx = [];
  for (const [a, b, c] of faces) idx.push(a, b, c, back(a), back(c), back(b));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return { mesh: new THREE.Mesh(geo, mat), zAt: (x, y) => (inside(x, y) ? surf(x, y).h : 0) };
}
// A thin flat part (a lens, an LED strip) laid onto a moulded panel, on one side of the bike.
function decal(w, h, cx, cy, rot, side, zAt, lift, mat) {
  const g = new THREE.PlaneGeometry(w, h, 24, 4), p = g.attributes.position, c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < p.count; i++) {
    const lx = p.getX(i), ly = p.getY(i), x = cx + lx * c - ly * s, y = cy + lx * s + ly * c;
    p.setXYZ(i, x, y, side * (zAt(x, y) + lift));
  }
  if (side < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]]; }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
// Cross-drilled brake disc: holes cut with an alpha map (RingGeometry's UVs span its outer square).
function drilled(base, rIn, rOut, holeR) {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), px = (v) => ((v / rOut + 1) / 2) * S;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#000000';
  const rings = [0.28, 0.52, 0.76];
  rings.forEach((f, ri) => {
    // a multiple of five holes per ring, so the pattern repeats every spoke (the video loops on whole spoke turns)
    const rr = rIn + (rOut - rIn) * f, count = 5 * Math.max(1, Math.round((2 * Math.PI * rr) / (holeR * 5.2) / 5));
    for (let i = 0; i < count; i++) {
      const a = ((i + (ri % 2) * 0.5) / count) * Math.PI * 2 + ri * 0.21;
      g.beginPath();
      g.arc(px(Math.cos(a) * rr), S - px(Math.sin(a) * rr), (holeR / rOut / 2) * S, 0, Math.PI * 2);
      g.fill();
    }
  });
  const m = base.clone();
  m.alphaMap = new THREE.CanvasTexture(c);
  m.alphaTest = 0.5;
  m.side = THREE.DoubleSide;
  return m;
}
// The TFT dash: a dark screen with a rev bar and a few blocks, no lettering.
function dashTexture() {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 240;
  const g = c.getContext('2d');
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 384, 240);
  for (let i = 0; i < 28; i++) {
    const a = Math.PI * (1.08 + (i / 27) * 0.84), r0 = 150, r1 = 172;
    g.strokeStyle = i > 22 ? '#ff3b30' : i < 17 ? '#5aa9ff' : '#2a3a4d';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(192 + Math.cos(a) * r0, 205 + Math.sin(a) * r0);
    g.lineTo(192 + Math.cos(a) * r1, 205 + Math.sin(a) * r1);
    g.stroke();
  }
  g.fillStyle = '#e8eef7';
  g.fillRect(150, 120, 84, 46);
  g.fillStyle = '#5aa9ff';
  g.fillRect(40, 196, 110, 8);
  g.fillRect(234, 196, 110, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rod(a, b, r, mat, seg = 20, rTop = r) {
  const A = a.isVector3 ? a : new THREE.Vector3(...a), B = b.isVector3 ? b : new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, A.distanceTo(B), seg), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}
function box(size, pos, mat, rotZ = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.set(...pos);
  m.rotation.z = rotZ;
  return m;
}

function wheel({ radius, width, front, M }) {
  const g = new THREE.Group();
  const hw = width / 2, rim = 0.216, rc = (radius + rim) / 2 + 0.008, ar = radius - rc;
  // tyre: rounded sport profile, revolved
  const prof = [new THREE.Vector2(rim, -hw * 0.86), new THREE.Vector2(rim + 0.02, -hw * 0.97)];
  for (let i = 0; i <= 28; i++) {
    const a = -Math.PI / 2 + (i / 28) * Math.PI, c = Math.cos(a), s = Math.sin(a);
    prof.push(new THREE.Vector2(rc + ar * Math.pow(Math.abs(c), 0.62), hw * Math.sign(s) * Math.pow(Math.abs(s), 0.75)));
  }
  prof.push(new THREE.Vector2(rim + 0.02, hw * 0.97), new THREE.Vector2(rim, hw * 0.86));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 120).rotateX(Math.PI / 2), M.rubber));
  // rim with a red pinstripe on each lip
  const rimProf = [[0.2, -hw * 0.9], [0.219, -hw * 0.9], [0.214, -hw * 0.8], [0.203, -hw * 0.6], [0.199, 0], [0.203, hw * 0.6], [0.214, hw * 0.8], [0.219, hw * 0.9], [0.2, hw * 0.9]].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(rimProf, 96).rotateX(Math.PI / 2), M.wheel));
  for (const z of [-hw * 0.9, hw * 0.9]) {
    const pin = new THREE.Mesh(new THREE.TorusGeometry(0.2085, 0.0032, 8, 120), M.pin);
    pin.position.z = z;
    g.add(pin);
  }
  // five split spokes
  const spokeLen = 0.15;
  for (let i = 0; i < 5; i++) {
    for (const split of [-1, 1]) {
      const geo = new THREE.BoxGeometry(spokeLen, 0.016, 0.026).translate(spokeLen / 2 + 0.05, 0, 0);
      const sp = new THREE.Mesh(geo, M.wheel);
      sp.rotation.z = (i / 5) * Math.PI * 2 + split * 0.075;
      g.add(sp);
    }
  }
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, width * 0.95, 32).rotateX(Math.PI / 2), M.gunmetal));
  for (const z of [-width * 0.5, width * 0.5]) {
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 6).rotateX(Math.PI / 2), M.titanium);
    nut.position.z = z;
    g.add(nut);
  }
  // brake discs (rotate with the wheel)
  const discs = front ? [-0.075, 0.075] : [0.1];
  for (const z of discs) {
    const rOut = front ? 0.16 : 0.11, rIn = front ? 0.108 : 0.078;
    const d = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 96), drilled(M.disc, rIn, rOut, front ? 0.0042 : 0.0034));
    d.position.z = z;
    g.add(d);
    const carrier = new THREE.Mesh(new THREE.RingGeometry(0.062, rIn, 48), M.gunmetal);
    carrier.position.z = z + Math.sign(z) * 0.002;
    g.add(carrier);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 12).rotateX(Math.PI / 2), M.titanium);
      b.position.set(Math.cos(a) * rIn, Math.sin(a) * rIn, z);
      g.add(b);
    }
  }
  if (!front) {
    const sprocket = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.105, 42), M.gunmetal);
    sprocket.position.z = -0.1;
    g.add(sprocket);
  }
  for (const m of g.children) if (m.material === M.disc || m.material === M.gunmetal) m.material.side = THREE.DoubleSide;
  return g;
}

export function buildSportBike({ anisotropy = 8 } = {}) {
  const paintOpts = { metalness: 0.3, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.025 };
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: RED, ...paintOpts }),
    livery: new THREE.MeshPhysicalMaterial({ map: liveryTexture(anisotropy), ...paintOpts }),
    gloss: new THREE.MeshPhysicalMaterial({ color: '#0d0d0f', metalness: 0.3, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 }),
    matte: new THREE.MeshStandardMaterial({ color: '#141416', metalness: 0.3, roughness: 0.65 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#1a1a1c', roughness: 0.74, metalness: 0 }),
    wheel: new THREE.MeshPhysicalMaterial({ color: '#121214', metalness: 0.6, roughness: 0.3, clearcoat: 0.7, side: THREE.DoubleSide }),
    pin: new THREE.MeshStandardMaterial({ color: '#e01b24', emissive: '#e0101c', emissiveIntensity: 0.25, roughness: 0.4 }),
    gold: new THREE.MeshStandardMaterial({ color: '#d9a84e', metalness: 1, roughness: 0.22 }),
    dlc: new THREE.MeshStandardMaterial({ color: '#1e1e24', metalness: 1, roughness: 0.18 }),
    disc: new THREE.MeshStandardMaterial({ color: '#c3c6cd', metalness: 1, roughness: 0.3 }),
    gunmetal: new THREE.MeshStandardMaterial({ color: '#555962', metalness: 0.9, roughness: 0.36 }),
    alu: new THREE.MeshStandardMaterial({ color: '#8d929b', metalness: 1, roughness: 0.32 }),
    titanium: new THREE.MeshStandardMaterial({ color: '#a7adb7', metalness: 1, roughness: 0.26 }),
    heat: new THREE.MeshStandardMaterial({ color: '#6c7896', metalness: 1, roughness: 0.3 }),
    caliper: new THREE.MeshPhysicalMaterial({ color: '#c81e1e', metalness: 0.3, roughness: 0.32, clearcoat: 1 }),
    seat: new THREE.MeshStandardMaterial({ color: '#2b282d', roughness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#252a33', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.5, clearcoat: 1 }),
    lens: new THREE.MeshPhysicalMaterial({ color: '#08090b', metalness: 0.5, roughness: 0.08, clearcoat: 1 }),
    led: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#eaf2ff', emissiveIntensity: 0, side: THREE.DoubleSide }),
    tail: new THREE.MeshStandardMaterial({ color: '#2a0000', emissive: '#ff1a1a', emissiveIntensity: 0, side: THREE.DoubleSide }),
    amber: new THREE.MeshStandardMaterial({ color: '#4a2000', emissive: '#ffb020', emissiveIntensity: 0.8 }),
    tft: new THREE.MeshStandardMaterial({ color: '#05070a', emissive: '#ffffff', emissiveMap: dashTexture(), emissiveIntensity: 0, roughness: 0.12, side: THREE.DoubleSide }),
  };
  const body = new THREE.Group();
  const add = (...o) => { body.add(...o); return o[0]; };

  // wheels
  const rearWheel = wheel({ radius: R_REAR, width: 0.19, front: false, M });
  rearWheel.position.copy(REAR);
  const frontWheel = wheel({ radius: R_FRONT, width: 0.12, front: true, M });
  frontWheel.position.copy(FRONT);
  add(rearWheel, frontWheel);

  // bodywork
  add(moulded([['M', 0.74, 0.88], ['L', 0.56, 0.96], ['L', 0.44, 0.95], ['Q', 0.3, 0.88, 0.12, 0.84], ['L', 0.04, 0.8], ['Q', -0.02, 0.7, -0.05, 0.58],
    ['Q', -0.07, 0.48, -0.02, 0.4], ['L', 0.3, 0.4], ['Q', 0.36, 0.42, 0.4, 0.48], ['L', 0.46, 0.56], ['Q', 0.53, 0.63, 0.62, 0.66], ['Q', 0.7, 0.72, 0.74, 0.88]],
  0.165, { round: 0.075, dome: 0.03, domeR: 0.2, mat: M.livery }).mesh);
  const nose = moulded([['M', 0.84, 0.885], ['L', 0.62, 0.975], ['L', 0.56, 0.95], ['L', 0.56, 0.7], ['L', 0.66, 0.68], ['Q', 0.76, 0.69, 0.84, 0.73]],
    0.11, { round: 0.05, dome: 0.012, domeR: 0.1, mat: M.livery });
  add(nose.mesh);
  add(moulded([['M', 0.96, 0.79], ['Q', 0.92, 0.85, 0.82, 0.895], ['L', 0.8, 0.72], ['Q', 0.88, 0.73, 0.96, 0.79]], 0.07, { round: 0.04, mat: M.livery }).mesh);
  add(moulded([['M', -0.02, 0.42], ['L', 0.3, 0.42], ['Q', 0.33, 0.37, 0.325, 0.3], ['Q', 0.33, 0.2, 0.33, 0.17], ['Q', 0.32, 0.13, 0.27, 0.13],
    ['L', 0.05, 0.13], ['Q', -0.08, 0.14, -0.11, 0.21], ['Q', -0.13, 0.3, -0.06, 0.4]], 0.115, { round: 0.06, dome: 0.015, domeR: 0.15, mat: M.livery }).mesh);
  add(moulded([['M', 0.46, 0.95], ['Q', 0.44, 1.06, 0.32, 1.085], ['Q', 0.16, 1.1, 0.02, 1.045], ['Q', -0.06, 1.01, -0.1, 0.93], ['L', -0.06, 0.86], ['Q', 0.2, 0.86, 0.46, 0.95]],
    0.15, { round: 0.1, dome: 0.035, domeR: 0.18, mat: M.livery }).mesh);
  const fuelCap = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.008, 32), M.gunmetal);
  fuelCap.position.set(0.2, 1.093, 0);
  fuelCap.rotation.z = -0.12;
  add(fuelCap);
  add(moulded([['M', -0.08, 0.93], ['Q', -0.24, 0.885, -0.4, 0.905], ['L', -0.43, 0.87], ['L', -0.4, 0.83], ['L', -0.06, 0.86]], 0.12, { round: 0.035, dome: 0.006, domeR: 0.05, mat: M.seat }).mesh);
  // tail fairing runs forward under the seat to meet the tank
  add(moulded([['M', -0.04, 0.87], ['Q', -0.22, 0.875, -0.4, 0.9], ['L', -0.66, 1.0], ['L', -0.66, 0.88], ['Q', -0.56, 0.84, -0.46, 0.8],
    ['Q', -0.26, 0.76, -0.04, 0.77]], 0.095, { round: 0.05, dome: 0.012, domeR: 0.1, mat: M.livery }).mesh);
  add(moulded([['M', -0.64, 0.995], ['L', -0.8, 1.05], ['L', -0.82, 1.01], ['Q', -0.74, 0.93, -0.64, 0.885]], 0.065, { round: 0.035, mat: M.livery }).mesh);
  add(panel(shapeOf([['M', -0.5, 0.83], ['L', -0.79, 0.985], ['L', -0.79, 0.95], ['L', -0.56, 0.79]]), 0.07, { bevel: 0.015, sides: M.gloss, walls: M.gloss }));
  add(panel(shapeOf([['M', 0.8, 0.905], ['Q', 0.7, 1.06, 0.52, 1.14], ['L', 0.49, 1.125], ['L', 0.6, 0.98]]), 0.105, { bevel: 0.012, segs: 3, sides: M.glass, walls: M.glass }));
  add(panel(arcShape(REAR.x, REAR.y, 0.335, 0.352, 0.6, 2.45), 0.1, { bevel: 0.012, segs: 3, sides: M.gloss, walls: M.gloss }));
  add(panel(arcShape(FRONT.x, FRONT.y, 0.312, 0.33, 0.55, 2.2), 0.06, { bevel: 0.012, segs: 3, sides: M.gloss, walls: M.gloss }));

  // headlights: twin LED eyes on dark lenses, and a ram-air intake
  for (const side of [-1, 1]) {
    add(decal(0.15, 0.04, 0.745, 0.83, 0.32, side, nose.zAt, 0.0015, M.lens));
    add(decal(0.13, 0.011, 0.75, 0.833, 0.32, side, nose.zAt, 0.003, M.led));
  }
  add(moulded([['M', 0.935, 0.766], ['L', 0.966, 0.776], ['Q', 0.972, 0.79, 0.966, 0.803], ['L', 0.935, 0.81]], 0.032, { round: 0.012, mat: M.lens, n: 120 }).mesh);
  // tail light
  add(box([0.012, 0.022, 0.11], [-0.818, 1.025, 0], M.tail, -0.4));
  for (const side of [-1, 1]) add(box([0.08, 0.008, 0.004], [-0.765, 1.02, side * 0.071], M.tail, 0.32));
  // mirrors with indicators
  for (const side of [-1, 1]) {
    add(rod([0.71, 0.9, side * 0.11], [0.69, 0.935, side * 0.22], 0.008, M.gloss));
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), M.gloss);
    h.scale.set(0.055, 0.028, 0.065);
    h.position.set(0.68, 0.94, side * 0.25);
    add(h);
    add(box([0.006, 0.006, 0.07], [0.733, 0.94, side * 0.25], M.amber));
  }
  // TFT dash behind the screen
  const tft = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.075), M.tft);
  tft.position.set(0.55, 1.0, 0);
  tft.rotation.set(0, -Math.PI / 2, 0);
  tft.rotateX(-0.9);
  add(tft);

  // frame spars and swingarm
  for (const side of [-1, 1]) {
    add(panel(shapeOf([['M', 0.47, 0.93], ['L', 0.38, 0.98], ['Q', 0.15, 0.86, -0.08, 0.66], ['L', -0.16, 0.48], ['L', -0.06, 0.46], ['Q', 0.05, 0.62, 0.47, 0.93]]),
      0.022, { bevel: 0.008, segs: 3, sides: M.alu, walls: M.alu, z: side * 0.17 }));
    add(panel(shapeOf([['M', -0.1, 0.52], ['Q', -0.4, 0.5, -0.73, 0.36], ['L', -0.73, 0.29], ['Q', -0.42, 0.36, -0.1, 0.4]]), 0.022,
      { bevel: 0.008, segs: 3, sides: M.gunmetal, walls: M.gunmetal, z: side * 0.125 }));
  }
  add(panel(shapeOf([['M', -0.18, 0.5], ['Q', -0.42, 0.6, -0.66, 0.4], ['L', -0.62, 0.38], ['Q', -0.42, 0.53, -0.18, 0.47]]), 0.016,
    { bevel: 0.006, segs: 2, sides: M.gunmetal, walls: M.gunmetal, z: 0.125 }));
  add(box([0.3, 0.2, 0.22], [0.1, 0.32, 0], M.matte));
  const pivotCover = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 24).rotateX(Math.PI / 2), M.titanium);
  pivotCover.position.set(-0.1, 0.46, 0);
  add(pivotCover);
  // chain (left side)
  {
    const pts = [], fs = new THREE.Vector2(-0.02, 0.36), rs = new THREE.Vector2(REAR.x, REAR.y);
    for (let i = 0; i <= 12; i++) { const a = Math.PI / 2 - (i / 12) * Math.PI; pts.push(new THREE.Vector3(fs.x + Math.cos(a) * 0.045, fs.y + Math.sin(a) * 0.045, -0.105)); }
    for (let i = 0; i <= 18; i++) { const a = -Math.PI / 2 - (i / 18) * Math.PI; pts.push(new THREE.Vector3(rs.x + Math.cos(a) * 0.105, rs.y + Math.sin(a) * 0.105, -0.105)); }
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, 0.007, 8, true), M.matte));
  }

  // inverted forks, clamps, clip-ons and front calipers
  for (const side of [-1, 1]) {
    const z = side * 0.095;
    add(rod(forkPoint(0.04, z), forkPoint(0.5, z), 0.024, M.dlc));
    add(rod(forkPoint(0.45, z), forkPoint(1.0, z), 0.032, M.gold, 28));
    add(rod(forkPoint(1.0, z), forkPoint(1.035, z), 0.024, M.gunmetal));
    const foot = box([0.06, 0.11, 0.045], [0, 0, 0], M.gloss);
    foot.position.copy(forkPoint(0.05, z));
    foot.rotation.z = RAKE;
    add(foot);
    const cal = box([0.12, 0.05, 0.038], [0, 0, 0], M.caliper);
    const a = THREE.MathUtils.degToRad(205);
    cal.position.set(FRONT.x + Math.cos(a) * 0.137, FRONT.y + Math.sin(a) * 0.137, side * 0.088);
    cal.rotation.z = a + Math.PI / 2;
    add(cal);
    const grip0 = forkPoint(0.93, side * 0.11);
    const grip1 = grip0.clone().add(new THREE.Vector3(-0.07, -0.035, side * 0.19));
    add(rod(grip0, grip1, 0.012, M.gloss));
    add(rod(grip1, grip1.clone().add(new THREE.Vector3(-0.03, -0.012, side * 0.11)), 0.019, M.rubber));
    add(rod(grip1.clone().add(new THREE.Vector3(0.04, 0.005, -side * 0.01)), grip1.clone().add(new THREE.Vector3(0.03, -0.01, side * 0.12)), 0.005, M.alu));
  }
  for (const [u, size, mat] of [[0.8, [0.07, 0.03, 0.27], M.gloss], [0.995, [0.09, 0.022, 0.27], M.gunmetal]]) {
    const clamp = box(size, [0, 0, 0], mat);
    clamp.position.copy(forkPoint(u));
    clamp.rotation.z = RAKE;
    add(clamp);
  }
  const rearCal = box([0.1, 0.045, 0.035], [0, 0, 0], M.caliper);
  const ra = THREE.MathUtils.degToRad(250);
  rearCal.position.set(REAR.x + Math.cos(ra) * 0.095, REAR.y + Math.sin(ra) * 0.095, 0.12);
  rearCal.rotation.z = ra + Math.PI / 2;
  add(rearCal);

  // exhaust: heat-tinted link pipe into a stubby titanium hex can (right side)
  add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0.14, 0.13, 0.06], [0.0, 0.14, 0.14], [-0.08, 0.24, 0.2], [-0.11, 0.3, 0.205]].map((p) => new THREE.Vector3(...p))), 48, 0.032, 16), M.heat));
  const can = rod([-0.1, 0.3, 0.205], [-0.46, 0.5, 0.215], 0.066, M.titanium, 6, 0.056);
  add(can);
  const capEnd = rod([-0.455, 0.497, 0.215], [-0.475, 0.508, 0.215], 0.058, M.gloss, 6, 0.058);
  add(capEnd);
  add(rod([-0.47, 0.505, 0.215], [-0.495, 0.519, 0.215], 0.028, M.matte, 20));
  // rearsets
  for (const side of [-1, 1]) {
    add(box([0.1, 0.05, 0.012], [-0.2, 0.44, side * 0.19], M.gunmetal, 0.4));
    add(rod([-0.22, 0.42, side * 0.19], [-0.22, 0.42, side * 0.25], 0.011, M.alu));
  }

  body.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return {
    body, rearWheel, frontWheel, led: M.led, tail: M.tail, tft: M.tft,
    headlight: new THREE.Vector3(0.95, 0.79, 0), tailLight: new THREE.Vector3(-0.84, 1.02, 0),
  };
}
