import fc from 'fast-check';
import { cellToLatLng } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { localPlane } from './geo.js';
import { detectLoops } from './loops.js';
import { circle, ORIGIN, trackAlong } from './testing.js';
import { processTrack } from './track.js';

const plane = localPlane(ORIGIN.lat, ORIGIN.lon);
const centreXY = (cell: string) => {
  const [lat, lon] = cellToLatLng(cell);
  return plane.toXY(lat, lon);
};
const walk = (xy: [number, number][], acc = 5, jitterM = 0) =>
  trackAlong(xy, { speedMps: 1.4, acc, jitterM });
const claimable = (xy: [number, number][], acc = 5, jitterM = 0) =>
  detectLoops(walk(xy, acc, jitterM)).filter((l) => l.status === 'claimable');
const allLands = (loops: { lands: string[] }[]) => loops.flatMap((l) => l.lands);

describe('detectLoops (F5, F6, N6)', () => {
  it('claims the Lands inside a 300 m circle, and only those', () => {
    const lands = allLands(claimable(circle(300)));
    // pi * 300^2 / 15,047 m^2 ~ 18.8 Lands
    expect(lands.length).toBeGreaterThanOrEqual(12);
    expect(lands.length).toBeLessThanOrEqual(22);
    for (const c of lands) expect(Math.hypot(centreXY(c).x, centreXY(c).y)).toBeLessThan(300);
  });

  it('an out-and-back path encloses nothing', () => {
    expect(
      detectLoops(
        walk([
          [0, 0],
          [800, 0],
          [0, 0],
        ]),
      ),
    ).toEqual([]);
  });

  it('closes within the tolerance, not beyond it', () => {
    // Stop short of the start: a 3 degree gap is ~16 m, a 30 degree gap ~155 m.
    const open = (gapDeg: number) => circle(300, 0, 0, 360).slice(0, 361 - gapDeg);
    expect(allLands(claimable(open(3))).length).toBeGreaterThan(0);
    expect(claimable(open(30))).toEqual([]);
  });

  it('a figure-8 gives two Loops', () => {
    // Both lobes start and end at the crossing point (0, 0).
    const left = circle(250, -250, 0);
    const right = left.map(([x, y]) => [-x, y] as [number, number]);
    const loops = claimable([...left, ...right]);
    expect(loops.length).toBe(2);
    const xs = loops.map((l) => Math.sign(l.lands.reduce((s, c) => s + centreXY(c).x, 0)));
    expect(xs.sort()).toEqual([-1, 1]);
  });

  it('two noisy laps claim each Land once and about the same area as one lap', () => {
    const one = new Set(allLands(claimable(circle(400), 8, 6)));
    const twoLaps = allLands(claimable([...circle(400), ...circle(400).slice(1)], 8, 6));
    expect(new Set(twoLaps).size).toBe(twoLaps.length);
    expect(Math.abs(twoLaps.length - one.size)).toBeLessThanOrEqual(Math.ceil(one.size * 0.25));
  });

  it('poor accuracy shrinks the claim (under-claim rather than over-claim)', () => {
    const good = allLands(claimable(circle(300), 5)).length;
    const poor = allLands(claimable(circle(300), 45)).length;
    expect(poor).toBeLessThan(good);
  });

  it('rejects a Loop over 20,000 Lands whole', () => {
    const loops = detectLoops(trackAlong(circle(10_500, 0, 0, 360), { speedMps: 17, acc: 10 }));
    expect(loops.some((l) => l.status === 'too_large' && l.lands.length === 0)).toBe(true);
    expect(loops.filter((l) => l.status === 'claimable')).toEqual([]);
  });

  it('never claims a Land whose centre is outside the Loop or within accuracy of the path', () => {
    fc.assert(
      fc.property(fc.integer({ min: 150, max: 700 }), fc.integer({ min: 3, max: 30 }), (r, acc) => {
        for (const c of allLands(claimable(circle(r), acc))) {
          // centre filter: >= acc from the path; the 72-gon chord sits inside the circle by < 0.1% r
          if (Math.hypot(centreXY(c).x, centreXY(c).y) > r - acc + 1) return false;
        }
        return true;
      }),
      { numRuns: 25 },
    );
  });
});

describe('processTrack', () => {
  it('a walking Loop claims in the Exercise category and records crossings', () => {
    const out = processTrack(walk(circle(300)));
    expect(out.earnsScore).toBe(true);
    expect(out.segments.map((s) => s.type)).toEqual(['walk']);
    expect(out.loops.every((l) => l.category === 'exercise')).toBe(true);
    expect(allLands(out.loops).length).toBeGreaterThan(0);
    expect(out.exerciseCrossings.length).toBeGreaterThan(0);
  });

  it('a driving Loop claims in Travel and is never a Visit', () => {
    const out = processTrack(trackAlong(circle(2000, 0, 0, 180), { speedMps: 15, acc: 8 }));
    expect(out.segments.map((s) => s.type)).toEqual(['drive']);
    expect(out.loops.length).toBeGreaterThan(0);
    expect(out.loops.every((l) => l.category === 'travel')).toBe(true);
    expect(out.exerciseCrossings).toEqual([]);
  });

  it('a Track that fails F11 claims nothing', () => {
    const pts = trackAlong(circle(2000, 0, 0, 180), { speedMps: 15, acc: 8 });
    const out = processTrack(pts, [{ type: 'walk', start: 0, end: pts.length - 1 }]);
    expect(out.earnsScore).toBe(false);
    expect(out.loops).toEqual([]);
  });
});
