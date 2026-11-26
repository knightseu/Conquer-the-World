/**
 * Loop detection and Land fill (SPEC F5, F6, N6), following the approach settled in
 * "Loop detection and cell-fill approach":
 *
 * 1. Project to a local metric plane and decimate.
 * 2. Add closure connectors where the path returns near an earlier point, with a
 *    tolerance scaled by both fixes' accuracy.
 * 3. Node the path + connectors and polygonize: every bounded face is a Loop candidate.
 *    This handles figure-8s, crossings, several Loops and repeated laps in one step.
 * 4. Fill each face with H3 centre containment (F5).
 * 5. Shrink by the local error margin (N6) as a centre filter: drop a cell whose centre
 *    is within the local accuracy of the path.
 *
 * Pure: no I/O. Every threshold is a placeholder to be tuned on field Tracks.
 */

import {
  cellToLatLng,
  getHexagonAreaAvg,
  POLYGON_TO_CELLS_FLAGS,
  polygonToCellsExperimental,
} from 'h3-js';
import ArrayList from 'jsts/java/util/ArrayList.js';
import Coordinate from 'jsts/org/locationtech/jts/geom/Coordinate.js';
import GeometryFactory, {
  type JstsLineString,
  type JstsPolygon,
} from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
import PrecisionModel from 'jsts/org/locationtech/jts/geom/PrecisionModel.js';
import GeometryNoder from 'jsts/org/locationtech/jts/noding/snapround/GeometryNoder.js';
import Polygonizer from 'jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js';
import { dist, distToSegment, type LocalPlane, localPlane, type XY } from './geo.js';
import { LAND_RESOLUTION } from './land.js';
import type { LandId, TrackPoint } from './types.js';

export interface LoopOptions {
  /** Decimation: keep a fix only if at least max(minGapM, acc) from the last kept fix. */
  minGapM: number;
  /** Base closure tolerance, metres (F6 placeholder 30 m). */
  baseCloseToleranceM: number;
  /** Closure tolerance scale: tol = max(base, k * sqrt(accI^2 + accJ^2)). */
  closeToleranceK: number;
  /** Path length between two fixes before they may close a Loop, metres. */
  minLoopPathM: number;
  /** A Loop over this many Lands is rejected whole (ADR 0004 / TODO.md placeholder). */
  maxLandsPerLoop: number;
}

export const DEFAULT_LOOP: LoopOptions = {
  minGapM: 10,
  baseCloseToleranceM: 30,
  closeToleranceK: 1.5,
  minLoopPathM: 100,
  maxLandsPerLoop: 20_000,
};

export type LoopStatus = 'claimable' | 'too_large';

export interface Loop {
  status: LoopStatus;
  /** Lands enclosed after the error-margin filter. Empty when too_large. */
  lands: LandId[];
  /** Face area, m^2. */
  areaM2: number;
}

interface PlanePoint extends XY {
  acc: number;
}

export function detectLoops(points: readonly TrackPoint[], o: LoopOptions = DEFAULT_LOOP): Loop[] {
  const first = points[0];
  if (!first || points.length < 4) return [];
  const plane = localPlane(first.lat, first.lon);
  const path = decimate(
    points.map((p) => ({ ...plane.toXY(p.lat, p.lon), acc: p.acc })),
    o.minGapM,
  );
  if (path.length < 4) return [];

  const connectors = closureConnectors(path, o);
  if (connectors.length === 0) return [];

  const lines: XY[][] = [path, ...connectors.map(([i, j]) => [path[i] as XY, path[j] as XY])];
  const faces = polygonize(lines);

  const edges = edgeIndex(path, connectors);
  const cellArea = getHexagonAreaAvg(LAND_RESOLUTION, 'm2');
  const loops: Loop[] = [];
  for (const face of faces) {
    const areaM2 = face.getArea();
    if (areaM2 < cellArea / 4) continue; // too small to hold a cell centre reliably
    if (areaM2 / cellArea > o.maxLandsPerLoop * 1.2) {
      loops.push({ status: 'too_large', lands: [], areaM2 });
      continue;
    }
    const lands = fillFace(face, plane).filter((cell) => {
      const [lat, lon] = cellToLatLng(cell);
      return !edges.withinMargin(plane.toXY(lat, lon));
    });
    if (lands.length === 0) continue; // F6: must enclose at least 1 Land
    loops.push(
      lands.length > o.maxLandsPerLoop
        ? { status: 'too_large', lands: [], areaM2 }
        : { status: 'claimable', lands, areaM2 },
    );
  }
  return loops;
}

/**
 * Nodes the lines with snap rounding (robust where classic overlay throws on
 * near-coincident GPS segments), dedupes overlapping segments, and returns every
 * bounded face. Retries on a coarser grid if rounding at 1 cm still fails.
 */
function polygonize(lines: XY[][]): JstsPolygon[] {
  let lastError: unknown;
  for (const scale of [100, 10, 1]) {
    try {
      const pm = new PrecisionModel(scale);
      const gf = new GeometryFactory(pm);
      const snap = (v: number) => Math.round(v * scale) / scale;
      const input = new ArrayList<JstsLineString>();
      for (const line of lines)
        input.add(gf.createLineString(line.map((p) => new Coordinate(snap(p.x), snap(p.y)))));
      const noded = new GeometryNoder(pm).node(input);

      const seen = new Set<string>();
      const segments = new ArrayList<JstsLineString>();
      for (const l of noded.toArray()) {
        const cs = l.getCoordinates();
        for (let k = 1; k < cs.length; k++) {
          const a = cs[k - 1] as Coordinate;
          const b = cs[k] as Coordinate;
          if (a.x === b.x && a.y === b.y) continue;
          const [p, q] = a.x < b.x || (a.x === b.x && a.y < b.y) ? [a, b] : [b, a];
          const key = `${p.x},${p.y},${q.x},${q.y}`;
          if (seen.has(key)) continue;
          seen.add(key);
          segments.add(gf.createLineString([new Coordinate(p.x, p.y), new Coordinate(q.x, q.y)]));
        }
      }
      const polygonizer = new Polygonizer();
      polygonizer.add(segments);
      return polygonizer.getPolygons().toArray();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

function decimate(pts: PlanePoint[], minGapM: number): PlanePoint[] {
  const out: PlanePoint[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) >= Math.max(minGapM, p.acc)) out.push(p);
  }
  const end = pts[pts.length - 1];
  if (end && out[out.length - 1] !== end) out.push(end);
  return out;
}

/**
 * Pairs (i, j) where the path returns within tolerance of an earlier fix. Near-misses
 * come in runs (consecutive fixes all close), so keep the closest pair per run.
 */
function closureConnectors(path: PlanePoint[], o: LoopOptions): [number, number][] {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push((cum[i - 1] as number) + dist(path[i - 1] as XY, path[i] as XY));
  }
  const maxAcc = Math.max(...path.map((p) => p.acc));
  const maxTol = Math.max(o.baseCloseToleranceM, o.closeToleranceK * Math.SQRT2 * maxAcc);
  const grid = new Grid<number>(maxTol);
  path.forEach((p, i) => {
    grid.insert(p, p, i);
  });

  const candidates: { i: number; j: number; d: number; tol: number }[] = [];
  path.forEach((pj, j) => {
    for (const i of grid.near(pj)) {
      if (i >= j) continue;
      const pi = path[i] as PlanePoint;
      if ((cum[j] as number) - (cum[i] as number) < o.minLoopPathM) continue;
      const tol = Math.max(o.baseCloseToleranceM, o.closeToleranceK * Math.hypot(pi.acc, pj.acc));
      const d = dist(pi, pj);
      if (d <= tol) candidates.push({ i, j, d, tol });
    }
  });

  candidates.sort((a, b) => a.d - b.d);
  const accepted: typeof candidates = [];
  for (const c of candidates) {
    const window = 2 * c.tol;
    const suppressed = accepted.some(
      (a) =>
        Math.abs((cum[a.i] as number) - (cum[c.i] as number)) <= window &&
        Math.abs((cum[a.j] as number) - (cum[c.j] as number)) <= window,
    );
    if (!suppressed) accepted.push(c);
  }
  return accepted.map(({ i, j }) => [i, j]);
}

function fillFace(face: JstsPolygon, plane: LocalPlane): LandId[] {
  const ring = (coords: Coordinate[]) =>
    coords.map((c) => {
      const { lat, lon } = plane.toLatLon(c);
      return [lon, lat];
    });
  const rings = [ring(face.getExteriorRing().getCoordinates())];
  for (let k = 0; k < face.getNumInteriorRing(); k++) {
    rings.push(ring(face.getInteriorRingN(k).getCoordinates()));
  }
  return polygonToCellsExperimental(
    rings,
    LAND_RESOLUTION,
    POLYGON_TO_CELLS_FLAGS.containmentCenter,
    true,
  );
}

/** Path and connector segments, each with its local error margin, indexed by grid. */
function edgeIndex(path: PlanePoint[], connectors: [number, number][]) {
  const segs: { a: XY; b: XY; margin: number }[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as PlanePoint;
    const b = path[i] as PlanePoint;
    segs.push({ a, b, margin: Math.max(a.acc, b.acc) });
  }
  for (const [i, j] of connectors) {
    const a = path[i] as PlanePoint;
    const b = path[j] as PlanePoint;
    segs.push({ a, b, margin: Math.max(a.acc, b.acc) });
  }
  const maxMargin = Math.max(1, ...segs.map((s) => s.margin));
  const grid = new Grid<number>(Math.max(maxMargin, 50));
  segs.forEach((s, k) => {
    grid.insert(
      { x: Math.min(s.a.x, s.b.x) - s.margin, y: Math.min(s.a.y, s.b.y) - s.margin },
      { x: Math.max(s.a.x, s.b.x) + s.margin, y: Math.max(s.a.y, s.b.y) + s.margin },
      k,
    );
  });
  return {
    withinMargin(p: XY): boolean {
      for (const k of grid.at(p)) {
        const s = segs[k] as (typeof segs)[number];
        if (distToSegment(p, s.a, s.b) < s.margin) return true;
      }
      return false;
    },
  };
}

/** Uniform grid over the plane; items are inserted by bounding box. */
class Grid<T> {
  private cells = new Map<string, T[]>();
  constructor(private size: number) {}

  private key(cx: number, cy: number) {
    return `${cx},${cy}`;
  }

  insert(min: XY, max: XY, item: T) {
    for (let cx = Math.floor(min.x / this.size); cx <= Math.floor(max.x / this.size); cx++) {
      for (let cy = Math.floor(min.y / this.size); cy <= Math.floor(max.y / this.size); cy++) {
        const k = this.key(cx, cy);
        const list = this.cells.get(k);
        if (list) list.push(item);
        else this.cells.set(k, [item]);
      }
    }
  }

  /** Items in the cell containing p. */
  at(p: XY): T[] {
    return this.cells.get(this.key(Math.floor(p.x / this.size), Math.floor(p.y / this.size))) ?? [];
  }

  /** Items in the 3x3 block around p (covers everything within `size` of p). */
  near(p: XY): T[] {
    const cx = Math.floor(p.x / this.size);
    const cy = Math.floor(p.y / this.size);
    const out: T[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++)
        out.push(...(this.cells.get(this.key(cx + dx, cy + dy)) ?? []));
    }
    return out;
  }
}
