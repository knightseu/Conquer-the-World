import { haversineM } from './geo.js';
import type { MovementType, TrackPoint } from './types.js';

/**
 * Movement classification thresholds (SPEC F3). [ASSUMPTION] placeholders, tuning
 * deferred (TODO.md). Speeds in km/h.
 */
export interface ClassifyOptions {
  walkMaxKmh: number;
  runMaxKmh: number;
  cycleMaxKmh: number;
  /** Speed is measured over at least this window, to smooth GPS jitter. */
  speedWindowS: number;
  /** Segments shorter than this are merged into a neighbour. */
  minSegmentS: number;
  /** A walk Segment climbing at least this fast (m/h, net gain) is a hike. */
  hikeMinGainMph: number;
}

export const DEFAULT_CLASSIFY: ClassifyOptions = {
  walkMaxKmh: 7,
  runMaxKmh: 15,
  cycleMaxKmh: 35,
  speedWindowS: 30,
  minSegmentS: 60,
  hikeMinGainMph: 150,
};

export interface Segment {
  type: MovementType;
  /** Inclusive index range into the classified points. */
  start: number;
  end: number;
}

export function speedClass(kmh: number, o: ClassifyOptions = DEFAULT_CLASSIFY): MovementType {
  if (kmh < o.walkMaxKmh) return 'walk';
  if (kmh < o.runMaxKmh) return 'run';
  if (kmh < o.cycleMaxKmh) return 'cycle';
  return 'drive';
}

/**
 * Smoothed speed (km/h) at each point: distance over the window centred on it.
 * Points must already be cleaned (strictly increasing time).
 */
export function smoothedSpeedsKmh(points: readonly TrackPoint[], windowS: number): number[] {
  const n = points.length;
  if (n < 2) return points.map(() => 0);
  const cum = [0];
  for (let i = 1; i < n; i++) {
    const a = points[i - 1] as TrackPoint;
    const b = points[i] as TrackPoint;
    cum.push((cum[i - 1] as number) + haversineM(a.lat, a.lon, b.lat, b.lon));
  }
  const half = (windowS * 1000) / 2;
  const out: number[] = [];
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    const t = (points[i] as TrackPoint).t;
    while (lo < i && (points[lo] as TrackPoint).t < t - half) lo++;
    if (hi < i) hi = i;
    while (hi < n - 1 && (points[hi] as TrackPoint).t <= t + half) hi++;
    let a = lo;
    let b = hi;
    if (a === b) {
      a = Math.max(0, i - 1);
      b = Math.min(n - 1, i + 1);
    }
    const dt = ((points[b] as TrackPoint).t - (points[a] as TrackPoint).t) / 1000;
    out.push(dt > 0 ? (((cum[b] as number) - (cum[a] as number)) / dt) * 3.6 : 0);
  }
  return out;
}

/**
 * Splits a cleaned Track into Segments of one Movement type (F3). Short Segments
 * are absorbed into the longer neighbour so a stop at a crossing does not split a run.
 */
export function classify(
  points: readonly TrackPoint[],
  o: ClassifyOptions = DEFAULT_CLASSIFY,
): Segment[] {
  if (points.length === 0) return [];
  const speeds = smoothedSpeedsKmh(points, o.speedWindowS);
  let segs: Segment[] = [];
  speeds.forEach((kmh, i) => {
    const type = speedClass(kmh, o);
    const last = segs[segs.length - 1];
    if (last && last.type === type) last.end = i;
    else segs.push({ type, start: i, end: i });
  });

  const durationS = (s: Segment) =>
    ((points[s.end] as TrackPoint).t - (points[s.start] as TrackPoint).t) / 1000;
  // Repeatedly merge the shortest too-short Segment into its longer neighbour.
  for (;;) {
    if (segs.length < 2) break;
    let idx = -1;
    let shortest = Number.POSITIVE_INFINITY;
    segs.forEach((s, i) => {
      const d = durationS(s);
      if (d < o.minSegmentS && d < shortest) {
        shortest = d;
        idx = i;
      }
    });
    if (idx < 0) break;
    const prev = segs[idx - 1];
    const next = segs[idx + 1];
    const into = !next || (prev && durationS(prev) >= durationS(next)) ? idx - 1 : idx + 1;
    const target = segs[into] as Segment;
    const victim = segs[idx] as Segment;
    target.start = Math.min(target.start, victim.start);
    target.end = Math.max(target.end, victim.end);
    segs.splice(idx, 1);
    segs = coalesce(segs);
  }

  return segs.map((s) => (s.type === 'walk' && isHike(points, s, o) ? { ...s, type: 'hike' } : s));
}

function coalesce(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.type === s.type) last.end = s.end;
    else out.push({ ...s });
  }
  return out;
}

function isHike(points: readonly TrackPoint[], s: Segment, o: ClassifyOptions): boolean {
  const a = points[s.start] as TrackPoint;
  const b = points[s.end] as TrackPoint;
  if (a.alt === undefined || b.alt === undefined) return false;
  const hours = (b.t - a.t) / 3_600_000;
  return hours > 0 && (b.alt - a.alt) / hours >= o.hikeMinGainMph;
}

/** Highest plausible sustained speed per labelled type, km/h (F11). */
const MAX_PLAUSIBLE_KMH: Record<MovementType, (o: ClassifyOptions) => number> = {
  walk: (o) => o.runMaxKmh,
  hike: (o) => o.runMaxKmh,
  run: (o) => o.cycleMaxKmh,
  cycle: (o) => o.cycleMaxKmh * 1.6,
  drive: () => Number.POSITIVE_INFINITY,
};

/**
 * Anti-abuse (F11): does a Segment's labelled type contradict how it moved?
 * Uses the 85th-percentile smoothed speed so one GPS spike does not condemn a Track.
 */
export function contradictsType(
  points: readonly TrackPoint[],
  seg: Segment,
  o: ClassifyOptions = DEFAULT_CLASSIFY,
): boolean {
  const slice = points.slice(seg.start, seg.end + 1);
  if (slice.length < 2) return false;
  const speeds = smoothedSpeedsKmh(slice, o.speedWindowS).sort((x, y) => x - y);
  const p85 = speeds[Math.floor(0.85 * (speeds.length - 1))] as number;
  return p85 > MAX_PLAUSIBLE_KMH[seg.type](o);
}

/** A Track earns no score if any Segment contradicts its type (F11). */
export function trackEarnsScore(
  points: readonly TrackPoint[],
  segs: readonly Segment[],
  o = DEFAULT_CLASSIFY,
): boolean {
  return !segs.some((s) => contradictsType(points, s, o));
}
