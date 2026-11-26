import {
  type ClassifyOptions,
  classify,
  DEFAULT_CLASSIFY,
  type Segment,
  trackEarnsScore,
} from './classify.js';
import { type CleanOptions, cleanTrack, DEFAULT_CLEAN } from './clean.js';
import { DEFAULT_LOOP, detectLoops, type Loop, type LoopOptions } from './loops.js';
import { type Category, categoryOf, type LandId, type TrackPoint } from './types.js';
import { landsCrossed } from './visits.js';

export interface TrackOptions {
  clean: CleanOptions;
  classify: ClassifyOptions;
  loop: LoopOptions;
}

export const DEFAULT_TRACK: TrackOptions = {
  clean: DEFAULT_CLEAN,
  classify: DEFAULT_CLASSIFY,
  loop: DEFAULT_LOOP,
};

export interface CategoryLoop extends Loop {
  category: Category;
  /** When the run that formed this Loop ended, ms epoch: the Claim/Visit time. */
  at: number;
}

export interface TrackOutcome {
  points: TrackPoint[];
  segments: Segment[];
  /** F11: false if any Segment contradicts its type. Then no Claims and no Visits. */
  earnsScore: boolean;
  loops: CategoryLoop[];
  /** Lands crossed by Exercise Segments, with the crossing time (for Visits). */
  exerciseCrossings: { land: LandId; at: number }[];
}

/**
 * Everything the server derives from one finished Track, without I/O.
 * Loops are detected per run of one category, so the movement type that made a
 * Loop decides its category (F6). Segment types may already be user-corrected.
 */
export function processTrack(
  raw: readonly TrackPoint[],
  segmentsOverride?: Segment[],
  o: TrackOptions = DEFAULT_TRACK,
): TrackOutcome {
  const { kept: points } = cleanTrack(raw, o.clean);
  const segments = segmentsOverride ?? classify(points, o.classify);
  const earnsScore = trackEarnsScore(points, segments, o.classify);
  if (!earnsScore) return { points, segments, earnsScore, loops: [], exerciseCrossings: [] };

  const loops: CategoryLoop[] = [];
  const exerciseCrossings: TrackOutcome['exerciseCrossings'] = [];
  for (const run of categoryRuns(segments)) {
    const slice = points.slice(run.start, run.end + 1);
    const at = (slice[slice.length - 1] as TrackPoint).t;
    for (const loop of detectLoops(slice, o.loop))
      loops.push({ ...loop, category: run.category, at });
    if (run.category === 'exercise') {
      for (const land of landsCrossed(slice)) exerciseCrossings.push({ land, at });
    }
  }
  return { points, segments, earnsScore, loops, exerciseCrossings };
}

function categoryRuns(segments: readonly Segment[]) {
  const runs: { category: Category; start: number; end: number }[] = [];
  for (const s of segments) {
    const category = categoryOf(s.type);
    const last = runs[runs.length - 1];
    if (last && last.category === category) last.end = s.end;
    else runs.push({ category, start: s.start, end: s.end });
  }
  return runs;
}
