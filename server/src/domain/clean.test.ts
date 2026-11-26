import { describe, expect, it } from 'vitest';
import { cleanTrack } from './clean.js';
import { trackAlong } from './testing.js';

describe('cleanTrack (F4)', () => {
  const walk = trackAlong(
    [
      [0, 0],
      [200, 0],
    ],
    { speedMps: 1.4 },
  );

  it('keeps a clean walk', () => {
    expect(cleanTrack(walk).kept).toHaveLength(walk.length);
  });

  it('drops fixes worse than 50 m accuracy', () => {
    const pts = walk.map((p, i) => (i === 10 ? { ...p, acc: 65 } : p));
    const r = cleanTrack(pts);
    expect(r.rejected).toEqual([{ point: pts[10], reason: 'accuracy' }]);
  });

  it('drops a teleport and keeps the fixes after it', () => {
    const pts = walk.map((p, i) => (i === 20 ? { ...p, lat: p.lat + 0.05 } : p));
    const r = cleanTrack(pts);
    expect(r.rejected.map((x) => x.reason)).toEqual(['speed_spike']);
    expect(r.kept).toHaveLength(walk.length - 1);
  });

  it('drops out-of-order and invalid fixes', () => {
    const a = walk[0];
    const b = walk[1];
    if (!a || !b) throw new Error('fixture');
    const r = cleanTrack([a, { ...b, t: a.t }, { ...b, lat: Number.NaN }, b]);
    expect(r.rejected.map((x) => x.reason)).toEqual(['out_of_order', 'invalid']);
  });
});
