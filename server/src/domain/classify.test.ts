import { describe, expect, it } from 'vitest';
import { classify, contradictsType, speedClass, trackEarnsScore } from './classify.js';
import { trackAlong } from './testing.js';
import type { TrackPoint } from './types.js';

const kmh = (v: number) => v / 3.6;

describe('speedClass (F3 placeholders)', () => {
  it.each([
    [4, 'walk'],
    [10, 'run'],
    [25, 'cycle'],
    [60, 'drive'],
  ] as const)('%d km/h is %s', (v, type) => expect(speedClass(v)).toBe(type));
});

describe('classify', () => {
  it('splits a walk then a drive into two Segments', () => {
    const walk = trackAlong(
      [
        [0, 0],
        [500, 0],
      ],
      { speedMps: kmh(5) },
    );
    const last = walk[walk.length - 1] as TrackPoint;
    const drive = trackAlong(
      [
        [500, 0],
        [8000, 0],
      ],
      { speedMps: kmh(60), startMs: last.t + 1000 },
    ).slice(1);
    const segs = classify([...walk, ...drive]);
    expect(segs.map((s) => s.type)).toEqual(['walk', 'drive']);
  });

  it('absorbs a short stop into the surrounding run', () => {
    const a = trackAlong(
      [
        [0, 0],
        [1000, 0],
      ],
      { speedMps: kmh(11) },
    );
    const t0 = (a[a.length - 1] as TrackPoint).t;
    const stop = trackAlong(
      [
        [1000, 0],
        [1010, 0],
      ],
      { speedMps: kmh(1), stepM: 1, startMs: t0 + 1000 },
    ).slice(1);
    const t1 = (stop[stop.length - 1] as TrackPoint).t;
    const b = trackAlong(
      [
        [1010, 0],
        [2000, 0],
      ],
      { speedMps: kmh(11), startMs: t1 + 1000 },
    ).slice(1);
    expect(classify([...a, ...stop, ...b]).map((s) => s.type)).toEqual(['run']);
  });

  it('labels a steep walk as a hike', () => {
    const pts = trackAlong(
      [
        [0, 0],
        [2000, 0],
      ],
      { speedMps: kmh(4) },
    ).map((p, i, all) => ({ ...p, alt: (300 * i) / all.length }));
    expect(classify(pts).map((s) => s.type)).toEqual(['hike']);
  });
});

describe('anti-abuse (F11)', () => {
  const drive = trackAlong(
    [
      [0, 0],
      [5000, 0],
    ],
    { speedMps: kmh(60) },
  );
  const seg = { type: 'walk' as const, start: 0, end: drive.length - 1 };

  it('a "walk" at 60 km/h contradicts its type and earns no score', () => {
    expect(contradictsType(drive, seg)).toBe(true);
    expect(trackEarnsScore(drive, [seg])).toBe(false);
  });

  it('the same Track labelled drive is fine', () => {
    expect(trackEarnsScore(drive, [{ ...seg, type: 'drive' }])).toBe(true);
  });
});
