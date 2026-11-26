// Alternative: node whole track (+ closure connectors) with JSTS, polygonize, fill faces.
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.join(process.argv[2], 'package.json'));
const h3 = require('h3-js');
const jsts = require('jsts');
console.log('jsts keys sample:', Object.keys(jsts).slice(0, 20), 'operation keys:', Object.keys(jsts.operation || {}));

const R = 6371008.8, LAT0 = 51.5, LNG0 = -0.12;
const mLat = Math.PI * R / 180, mLng = mLat * Math.cos(LAT0 * Math.PI / 180);
let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const accCity = i => (i % 600 < 120 ? 35 : 8);
function track(n, f, accFn, laps) { const o = []; for (let i = 0; i < n; i++) { const t = (i / n) * 2 * Math.PI * laps, a = accFn(i), [x, y] = f(t); o.push({ x: x + gauss() * a / 2, y: y + gauss() * a / 2, acc: a }); } return o; }
const circle = r => t => [r * Math.cos(t), r * Math.sin(t)];
const fig8 = a => t => [a * Math.sin(t), a * Math.sin(t) * Math.cos(t)];
// open "C" that stops 25 m short of its start: needs a closure connector
const gapC = r => t => [r * Math.cos(t), r * Math.sin(t)];

const gf = new jsts.geom.GeometryFactory();
const C = (x, y) => new jsts.geom.Coordinate(x, y);
function decimate(pts) { const out = [pts[0]]; for (const p of pts) { const l = out.at(-1); if (Math.hypot(p.x - l.x, p.y - l.y) >= Math.max(10, p.acc, l.acc)) out.push(p); } if (out.at(-1) !== pts.at(-1)) out.push(pts.at(-1)); return out; }

function closureConnectors(pts, { base = 30, k = 1.5, minGapM = 300 } = {}) {
  // near-miss closures: endpoint of track and points where path re-enters tolerance of an older point.
  // v1 simplification: only the track end vs all earlier points (covers "stopped just short of start").
  const along = [0]; for (let i = 1; i < pts.length; i++) along[i] = along[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const e = pts.length - 1, p = pts[e]; let best = -1, bd = Infinity;
  for (let j = 0; j < e; j++) { if (along[e] - along[j] < minGapM) break; const d = Math.hypot(pts[j].x - p.x, pts[j].y - p.y); if (d <= Math.max(base, k * Math.hypot(p.acc, pts[j].acc)) && d < bd) { bd = d; best = j; } }
  return best >= 0 ? [[best, e]] : [];
}

function faces(pts) {
  const lines = [gf.createLineString(pts.map(p => C(p.x, p.y)))];
  for (const [a, b] of closureConnectors(pts)) lines.push(gf.createLineString([C(pts[a].x, pts[a].y), C(pts[b].x, pts[b].y)]));
  const noded = jsts.operation.union.UnaryUnionOp.union(gf.createMultiLineString(lines)); // nodes all crossings
  const pz = new jsts.operation.polygonize.Polygonizer();
  pz.add(noded);
  return pz.getPolygons().toArray();
}

const toLL = c => [LNG0 + c.x / mLng, LAT0 + c.y / mLat];
function fill(polys, pts) {
  // centre-in-face, then drop centres within local accuracy of any track segment
  const set = new Set();
  for (const pg of polys) {
    if (pg.getArea() < 5000) continue; // < 1/3 of a Land: cannot contain a centre after shrink, skip cheaply
    const rings = [pg.getExteriorRing().getCoordinates().map(toLL)];
    for (let i = 0; i < pg.getNumInteriorRing(); i++) rings.push(pg.getInteriorRingN(i).getCoordinates().map(toLL));
    for (const c of h3.polygonToCellsExperimental(rings, 10, h3.POLYGON_TO_CELLS_FLAGS.containmentCenter, true)) set.add(c);
  }
  const cell = 100, grid = new Map(), key = (i, j) => i * 1e6 + j;
  for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1]; for (let gx = Math.floor(Math.min(a.x, b.x) / cell); gx <= Math.floor(Math.max(a.x, b.x) / cell); gx++) for (let gy = Math.floor(Math.min(a.y, b.y) / cell); gy <= Math.floor(Math.max(a.y, b.y) / cell); gy++) { const kk = key(gx, gy); (grid.get(kk) ?? grid.set(kk, []).get(kk)).push(i); } }
  const ds = (px, py, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy; let t = l ? ((px - a.x) * dx + (py - a.y) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - a.x - t * dx, py - a.y - t * dy); };
  let kept = 0;
  for (const c of set) { const [lat, lng] = h3.cellToLatLng(c); const x = (lng - LNG0) * mLng, y = (lat - LAT0) * mLat; const gx = Math.floor(x / cell), gy = Math.floor(y / cell); let ok = true;
    for (let i = gx - 1; i <= gx + 1 && ok; i++) for (let j = gy - 1; j <= gy + 1 && ok; j++) for (const s of grid.get(key(i, j)) ?? []) if (ds(x, y, pts[s], pts[s + 1]) <= Math.max(pts[s].acc, pts[s + 1].acc)) { ok = false; break; }
    if (ok) kept++; }
  return { raw: set.size, kept };
}
const T = (l, f) => { const t = performance.now(); const r = f(); console.log(l.padEnd(46), (performance.now() - t).toFixed(1).padStart(8), 'ms'); return r; };
for (const [name, pts0, expect] of [
  ['walk 1h circle r=800m', track(3600, circle(800), accCity, 1.05), Math.PI * 800 ** 2 / 13454],
  ['walk 1h figure-8 a=1200m', track(3600, fig8(1200), accCity, 1.03), (4 / 3) * 1200 ** 2 / 13454],
  ['walk 1h C-shape stops ~25m short r=800m', track(3600, gapC(800), () => 8, 1 - 25 / (2 * Math.PI * 800)), Math.PI * 800 ** 2 / 13454],
  ['drive 1h circle r=9.5km', track(3600, circle(9500), () => 10, 1.05), Math.PI * 9500 ** 2 / 13454],
]) {
  console.log(`\n== ${name}  (ideal cells ~${Math.round(expect)})`);
  for (const [lab, pts] of [['raw', pts0], ['decimated', decimate(pts0)]]) {
    const fs = T(`  ${lab} (${pts.length} pts): node+polygonize`, () => faces(pts));
    const r = T(`  ${lab}: fill ${fs.length} faces + shrink`, () => fill(fs, pts));
    console.log('   ', JSON.stringify(r));
  }
}
