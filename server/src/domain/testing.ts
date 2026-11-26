// Synthetic Track builders for tests. Real fixture Tracks replace most of these once
// "Fixture Track source and format" is settled; synthetic GPS hides real-world noise.
import { localPlane } from './geo.js';
import type { TrackPoint } from './types.js';

export const ORIGIN = { lat: 47.6062, lon: -122.3321 }; // Seattle

export interface PathOpts {
  speedMps: number;
  acc?: number;
  stepM?: number;
  startMs?: number;
  /** Deterministic jitter amplitude in metres. */
  jitterM?: number;
}

/** A Track along a polyline given in local metres around ORIGIN. */
export function trackAlong(xy: [number, number][], o: PathOpts): TrackPoint[] {
  const plane = localPlane(ORIGIN.lat, ORIGIN.lon);
  const step = o.stepM ?? Math.max(1, o.speedMps); // ~1 fix per second
  const out: TrackPoint[] = [];
  let t = o.startMs ?? Date.UTC(2026, 10, 1, 8);
  let seed = 1;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  for (let k = 1; k < xy.length; k++) {
    const [x0, y0] = xy[k - 1] as [number, number];
    const [x1, y1] = xy[k] as [number, number];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / step));
    for (let s = k === 1 ? 0 : 1; s <= n; s++) {
      const f = s / n;
      const j = o.jitterM ?? 0;
      const { lat, lon } = plane.toLatLon({
        x: x0 + (x1 - x0) * f + rnd() * j,
        y: y0 + (y1 - y0) * f + rnd() * j,
      });
      out.push({ t, lat, lon, acc: o.acc ?? 5 });
      t += (len / n / o.speedMps) * 1000;
    }
  }
  return out;
}

/** A closed circle of radius r metres, starting and ending at angle 0. */
export function circle(r: number, cx = 0, cy = 0, n = 72): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
  });
}
