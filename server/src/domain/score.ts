import type { Category, LandId } from './types.js';

const DAY_MS = 86_400_000;

/** Whole UTC calendar day number (days since 1970-01-01). */
export function utcDay(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

/** Rot half-life in days (SPEC F10, [ASSUMPTION]; revisit per TODO.md). */
export const ROT_HALF_LIFE_DAYS = 365;

/** A user's permanent Claim on a Land in one category (ADR 0004). */
export interface Claim {
  userId: string;
  land: LandId;
  category: Category;
  /** When the Claim was made, ms epoch. */
  claimedAt: number;
  /** Most recent Visit, ms epoch. The claiming Loop is itself a Visit. */
  lastVisitAt: number;
}

/** Score: 1 per UTC day held, counting the claim day (F9). 0 before the claim day. */
export function rawScore(claimedAt: number, todayMs: number): number {
  return Math.max(0, utcDay(todayMs) - utcDay(claimedAt) + 1);
}

/** Exercise Score after Rot; Travel never rots (F10). */
export function effectiveScore(
  c: Pick<Claim, 'category' | 'claimedAt' | 'lastVisitAt'>,
  todayMs: number,
): number {
  const raw = rawScore(c.claimedAt, todayMs);
  if (c.category === 'travel') return raw;
  const idle = Math.max(0, utcDay(todayMs) - utcDay(Math.max(c.lastVisitAt, c.claimedAt)));
  return raw * 0.5 ** (idle / ROT_HALF_LIFE_DAYS);
}

/**
 * Owner of one Land in one category within a Clan (ADR 0004): highest effective
 * Score among the given Claims (the Clan members' Claims on that Land and category).
 * Ties: earliest Claim, then most recent Visit, then lowest user id.
 */
export function ownerOf(claims: readonly Claim[], todayMs: number): Claim | undefined {
  let best: Claim | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const c of claims) {
    const s = effectiveScore(c, todayMs);
    if (!best || beats(c, s, best, bestScore)) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

const EPS = 1e-9;

function beats(a: Claim, sa: number, b: Claim, sb: number): boolean {
  if (Math.abs(sa - sb) > EPS) return sa > sb;
  if (a.claimedAt !== b.claimedAt) return a.claimedAt < b.claimedAt;
  if (a.lastVisitAt !== b.lastVisitAt) return a.lastVisitAt > b.lastVisitAt;
  return a.userId < b.userId;
}

/**
 * Applies a Loop to a user's existing Claims (ADR 0004): a new Land gets a new Claim;
 * a Land already held in that category gets a Visit only (no bonus, no second Claim).
 */
export function applyLoop(
  existing: ReadonlyMap<LandId, Claim>,
  userId: string,
  category: Category,
  lands: Iterable<LandId>,
  at: number,
): { created: Claim[]; visited: Claim[] } {
  const created: Claim[] = [];
  const visited: Claim[] = [];
  for (const land of lands) {
    const c = existing.get(land);
    if (c) visited.push({ ...c, lastVisitAt: Math.max(c.lastVisitAt, at) });
    else created.push({ userId, land, category, claimedAt: at, lastVisitAt: at });
  }
  return { created, visited };
}
