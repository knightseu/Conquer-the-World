import { haversineM } from './geo.js';
import type { TrackPoint } from './types.js';

/** Point-cleaning thresholds (SPEC F4). Placeholders, to be tuned on field data. */
export interface CleanOptions {
  /** Fixes with worse reported accuracy are dropped, in metres. */
  maxAccuracyM: number;
  /** Implied speed from the previous kept fix above this is a teleport/spike, in m/s. */
  maxSpeedMps: number;
}

export const DEFAULT_CLEAN: CleanOptions = {
  maxAccuracyM: 50,
  maxSpeedMps: 70, // ~250 km/h: faster than any plausible driving Segment
};

export type RejectReason = 'accuracy' | 'invalid' | 'out_of_order' | 'speed_spike';

export interface CleanResult {
  kept: TrackPoint[];
  rejected: { point: TrackPoint; reason: RejectReason }[];
}

/**
 * Drops implausible fixes (F4): bad accuracy, invalid coordinates, non-increasing
 * timestamps, and fixes implying an impossible jump from the last kept fix.
 * Input must be in recording order; output keeps that order.
 */
export function cleanTrack(
  points: readonly TrackPoint[],
  opts: CleanOptions = DEFAULT_CLEAN,
): CleanResult {
  const kept: TrackPoint[] = [];
  const rejected: CleanResult['rejected'] = [];
  for (const p of points) {
    const reason = rejectReason(p, kept[kept.length - 1], opts);
    if (reason) rejected.push({ point: p, reason });
    else kept.push(p);
  }
  return { kept, rejected };
}

function rejectReason(
  p: TrackPoint,
  prev: TrackPoint | undefined,
  opts: CleanOptions,
): RejectReason | null {
  const valid =
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Number.isFinite(p.t) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180 &&
    p.acc >= 0;
  if (!valid) return 'invalid';
  if (p.acc > opts.maxAccuracyM) return 'accuracy';
  if (!prev) return null;
  if (p.t <= prev.t) return 'out_of_order';
  const d = haversineM(prev.lat, prev.lon, p.lat, p.lon);
  // Allow the jump that the two fixes' own error could explain.
  const slack = p.acc + prev.acc;
  if (d - slack > opts.maxSpeedMps * ((p.t - prev.t) / 1000)) return 'speed_spike';
  return null;
}
