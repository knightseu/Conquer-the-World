import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyLoop, type Claim, effectiveScore, ownerOf, rawScore, utcDay } from './score.js';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 10, 23, 59); // late on a UTC day

const claim = (over: Partial<Claim>): Claim => ({
  userId: 'u1',
  land: '8a2a1072b59ffff',
  category: 'exercise',
  claimedAt: T0,
  lastVisitAt: T0,
  ...over,
});

describe('Score (F9, ADR 0004)', () => {
  it('is 1 on the claim day, counting whole UTC days', () => {
    expect(rawScore(T0, T0)).toBe(1);
    expect(rawScore(T0, T0 + 2 * 60_000)).toBe(2); // crossed UTC midnight
    expect(rawScore(T0, T0 + 9 * DAY)).toBe(10);
    expect(rawScore(T0, T0 - DAY)).toBe(0);
  });

  it('Exercise rots to half after 365 idle days; Travel never rots (F10)', () => {
    const today = T0 + 365 * DAY;
    expect(effectiveScore(claim({}), today)).toBeCloseTo(366 * 0.5, 9);
    expect(effectiveScore(claim({ category: 'travel' }), today)).toBe(366);
    expect(effectiveScore(claim({ lastVisitAt: today }), today)).toBe(366);
  });

  it('an unvisited Exercise Score peaks near day 527', () => {
    const scores = Array.from({ length: 1000 }, (_, d) => effectiveScore(claim({}), T0 + d * DAY));
    const peak = scores.indexOf(Math.max(...scores));
    expect(peak).toBeGreaterThan(520);
    expect(peak).toBeLessThan(535);
  });

  it('never decreases while Visits keep coming', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), (d) => {
        const today = T0 + d * DAY;
        const next = today + DAY;
        return (
          effectiveScore(claim({ lastVisitAt: next }), next) >=
          effectiveScore(claim({ lastVisitAt: today }), today)
        );
      }),
    );
  });
});

describe('Owner (ADR 0004)', () => {
  const today = T0 + 100 * DAY;

  it('is the highest Score', () => {
    const a = claim({ userId: 'a', claimedAt: T0 + 10 * DAY, lastVisitAt: today });
    const b = claim({ userId: 'b', claimedAt: T0, lastVisitAt: today });
    expect(ownerOf([a, b], today)?.userId).toBe('b');
  });

  it('ties go to the earliest Claim, then the latest Visit, then the lowest user id', () => {
    const sameDayEarly = claim({ userId: 'z', claimedAt: T0 - 60_000 });
    const sameDayLate = claim({ userId: 'a', claimedAt: T0 });
    expect(ownerOf([sameDayLate, sameDayEarly], T0)?.userId).toBe('z');

    const visitedLater = claim({ userId: 'y', lastVisitAt: T0 + 1 });
    expect(ownerOf([claim({ userId: 'a' }), visitedLater], T0)?.userId).toBe('y');

    expect(ownerOf([claim({ userId: 'b' }), claim({ userId: 'a' })], T0)?.userId).toBe('a');
  });

  it('is exactly one of the claimants, whatever the order', () => {
    const arb = fc.array(
      fc.record({
        userId: fc.string({ minLength: 1, maxLength: 3 }),
        claimedDay: fc.integer({ min: 0, max: 400 }),
        visitDay: fc.integer({ min: 0, max: 400 }),
      }),
      { minLength: 1, maxLength: 8 },
    );
    fc.assert(
      fc.property(arb, (rows) => {
        const claims = rows.map((r) =>
          claim({
            userId: r.userId,
            claimedAt: T0 + r.claimedDay * DAY,
            lastVisitAt: T0 + Math.max(r.claimedDay, r.visitDay) * DAY,
          }),
        );
        const now = T0 + 400 * DAY;
        const o1 = ownerOf(claims, now);
        const o2 = ownerOf([...claims].reverse(), now);
        return (
          o1 !== undefined &&
          claims.includes(o1) &&
          o1.userId === o2?.userId &&
          o1.claimedAt === o2.claimedAt
        );
      }),
    );
  });
});

describe('applyLoop', () => {
  it('creates Claims for new Lands and only Visits held ones', () => {
    const held = claim({ land: 'held' });
    const at = T0 + 30 * DAY;
    const r = applyLoop(new Map([['held', held]]), 'u1', 'exercise', ['held', 'new'], at);
    expect(r.visited).toEqual([{ ...held, lastVisitAt: at }]);
    expect(r.created).toEqual([claim({ land: 'new', claimedAt: at, lastVisitAt: at })]);
    expect(utcDay(r.visited[0]?.claimedAt ?? 0)).toBe(utcDay(T0)); // no bonus, no reset
  });
});
