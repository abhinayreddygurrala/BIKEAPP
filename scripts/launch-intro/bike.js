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
    const d = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 96), M.disc);
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
  const paintOpts = { metalness: 0.15, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.04 };
  const M = {
    paint: new THREE.MeshPhysicalMaterial({ color: RED, ...paintOpts }),
    walls: new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, ...paintOpts }),
    livery: new THREE.MeshPhysicalMaterial({ map: liveryTexture(anisotropy), ...paintOpts }),
    gloss: new THREE.MeshPhysicalMaterial({ color: '#0d0d0f', metalness: 0.3, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 }),
    matte: new THREE.MeshStandardMaterial({ color: '#141416', metalness: 0.3, roughness: 0.65 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.86, metalness: 0 }),
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
    tft: new THREE.MeshStandardMaterial({ color: '#05070a', emissive: '#7cc0ff', emissiveIntensity: 0, side: THREE.DoubleSide }),
  };
  const livery = { sides: M.livery, walls: M.walls, livery: true };
  const body = new THREE.Group();
  const add = (...o) => { body.add(...o); return o[0]; };

  // wheels
  const rearWheel = wheel({ radius: R_REAR, width: 0.19, front: false, M });
  rearWheel.position.copy(REAR);
  const frontWheel = wheel({ radius: R_FRONT, width: 0.12, front: true, M });
  frontWheel.position.copy(FRONT);
  add(rearWheel, frontWheel);

  // bodywork
  add(panel(shapeOf([['M', 0.74, 0.88], ['L', 0.56, 0.96], ['L', 0.44, 0.95], ['Q', 0.3, 0.88, 0.12, 0.84], ['L', 0.04, 0.8], ['Q', -0.02, 0.7, -0.05, 0.58],
    ['Q', -0.07, 0.48, -0.02, 0.4], ['L', 0.3, 0.4], ['Q', 0.36, 0.42, 0.4, 0.48], ['L', 0.46, 0.56], ['Q', 0.53, 0.63, 0.62, 0.66], ['Q', 0.7, 0.72, 0.74, 0.88]]),
  0.19, { bevel: 0.035, ...livery }));
  add(panel(shapeOf([['M', 0.84, 0.885], ['L', 0.62, 0.975], ['L', 0.56, 0.95], ['L', 0.56, 0.7], ['L', 0.66, 0.68], ['Q', 0.76, 0.69, 0.84, 0.73]]),
    0.12, { bevel: 0.04, ...livery }));
  add(panel(shapeOf([['M', 0.96, 0.79], ['Q', 0.92, 0.85, 0.82, 0.895], ['L', 0.8, 0.72], ['Q', 0.88, 0.73, 0.96, 0.79]]), 0.075, { bevel: 0.035, ...livery }));
  add(panel(shapeOf([['M', -0.02, 0.42], ['L', 0.3, 0.42], ['Q', 0.33, 0.37, 0.325, 0.3], ['Q', 0.33, 0.2, 0.33, 0.17], ['Q', 0.32, 0.13, 0.27, 0.13],
    ['L', 0.05, 0.13], ['Q', -0.08, 0.14, -0.11, 0.21], ['Q', -0.13, 0.3, -0.06, 0.4]]), 0.125, { bevel: 0.04, ...livery }));
  add(panel(shapeOf([['M', 0.46, 0.95], ['Q', 0.44, 1.06, 0.32, 1.085], ['Q', 0.16, 1.1, 0.02, 1.045], ['Q', -0.06, 1.01, -0.1, 0.93], ['L', -0.06, 0.86], ['Q', 0.2, 0.86, 0.46, 0.95]]),
    0.175, { bevel: 0.065, segs: 7, ...livery }));
  const fuelCap = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.008, 32), M.gunmetal);
  fuelCap.position.set(0.2, 1.093, 0);
  fuelCap.rotation.z = -0.12;
  add(fuelCap);
  add(panel(shapeOf([['M', -0.08, 0.93], ['Q', -0.24, 0.885, -0.4, 0.905], ['L', -0.43, 0.87], ['L', -0.4, 0.83], ['L', -0.06, 0.86]]), 0.125, { bevel: 0.03, sides: M.seat, walls: M.seat }));
  // tail fairing runs forward under the seat to meet the tank
  add(panel(shapeOf([['M', -0.04, 0.87], ['Q', -0.22, 0.875, -0.4, 0.9], ['L', -0.66, 1.0], ['L', -0.66, 0.88], ['Q', -0.56, 0.84, -0.46, 0.8],
    ['Q', -0.26, 0.76, -0.04, 0.77]]), 0.105, { bevel: 0.035, ...livery }));
  add(panel(shapeOf([['M', -0.64, 0.995], ['L', -0.8, 1.05], ['L', -0.82, 1.01], ['Q', -0.74, 0.93, -0.64, 0.885]]), 0.07, { bevel: 0.028, ...livery }));
  add(panel(shapeOf([['M', -0.5, 0.83], ['L', -0.79, 0.985], ['L', -0.79, 0.95], ['L', -0.56, 0.79]]), 0.07, { bevel: 0.015, sides: M.gloss, walls: M.gloss }));
  add(panel(shapeOf([['M', 0.8, 0.905], ['Q', 0.7, 1.06, 0.52, 1.14], ['L', 0.49, 1.125], ['L', 0.6, 0.98]]), 0.105, { bevel: 0.012, segs: 3, sides: M.glass, walls: M.glass }));
  add(panel(arcShape(REAR.x, REAR.y, 0.335, 0.352, 0.6, 2.45), 0.1, { bevel: 0.012, segs: 3, sides: M.gloss, walls: M.gloss }));
  add(panel(arcShape(FRONT.x, FRONT.y, 0.312, 0.33, 0.55, 2.2), 0.06, { bevel: 0.012, segs: 3, sides: M.gloss, walls: M.gloss }));

  // headlights: twin LED eyes on dark lenses, and a ram-air intake
  for (const side of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.04), M.lens);
    lens.position.set(0.745, 0.83, side * 0.1215);
    lens.rotation.set(0, side < 0 ? Math.PI : 0, 0.32 * side * (side < 0 ? -1 : 1));
    add(lens);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.011), M.led);
    strip.position.set(0.75, 0.833, side * 0.1222);
    strip.rotation.copy(lens.rotation);
    add(strip);
  }
  add(box([0.02, 0.045, 0.07], [0.955, 0.785, 0], M.lens));
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
