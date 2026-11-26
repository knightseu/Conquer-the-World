# Conquer the World – Implementation Plan

Companion to `SPEC.md`. Status: **final for v1** (confirmed 2026-11-21); implementation start is a separate owner decision. Strategy: **riskiest things first** (background GPS and loop detection), thin vertical slices after that.

## Architecture (v1)

```
iPhone app (SwiftUI) ──HTTPS/JSON──> API service ──> Postgres + PostGIS
  - background GPS                    - auth (Sign in with Apple)
  - offline queue                     - track ingest + cleaning
  - map (MapKit or MapLibre)          - classifier, loop detector
                                      - scoring job (daily)
                                      - leaderboard queries
```

**Decisions to confirm (candidates for ADRs):**
- **iOS client:** native Swift/SwiftUI. Reliable background location is the core feature, and cross-platform frameworks still need native code for it. Portability is kept via the server-side-logic rule (N1). Alternative: Flutter or React Native if you'd rather share UI code with Android later.
- **Backend:** TypeScript (Node) or Kotlin; Postgres + PostGIS; `h3-js` for cells. At 100 users, one small container and one database is enough.
- **Land = H3 res 10 cell.**

## Milestones

### M0 – Foundations (≈ 1 week)
- Create `GLOSSARY.md` (terms from SPEC §1) and ADRs for the three decisions above.
- Repo layout: `myland/app-ios`, `myland/server`, `myland/api` (OpenAPI).
- CI: server tests + lint; iOS build.
- **Done when:** empty app and empty API deploy and talk to each other.

### M1 – Recording spike (≈ 1–2 weeks) ← highest risk
- iOS app records Tracks in the background; offline queue; upload.
- Server stores points; a debug page draws the Track.
- **Done when:** a 1-hour walk with the screen locked produces a clean Track, and battery use is measured against N2.

### M2 – Movement classification (≈ 1 week)
- Point cleaning (F4) and Segment classification (F3).
- Tests with recorded fixture Tracks: walk, run, bike, car, mixed.
- **Done when:** fixtures classify correctly and the user can edit a Segment type.

### M3 – Loop detection and claiming (≈ 2 weeks) ← second highest risk
- Loop detector (F5/F6) and polygon → H3 cells fill.
- Edge cases: figure-8, self-intersecting paths, GPS drift at the closing point, very large loops, multiple loops per Track.
- **Done when:** property tests and ≥ 10 real-world fixture Tracks give the expected claimed cells.

### M4 – Map and ownership (≈ 1–2 weeks)
- Auth, profile, one hard-coded Clan.
- Map draws Lands coloured by owner, with an Exercising/Traveling toggle; tap for details (F16–F18).
- **Done when:** two test users claim overlapping Lands and the map shows the right owner.

### M5 – Scoring (≈ 1 week)
- Daily scoring job with two categories (Exercise, Travel), equal weights for now, Exercise rot (half after 1 year), anti-abuse check (F8–F11).
- **Done when:** a scripted multi-day simulation matches hand-calculated scores.

### M6 – Clans and leaderboards (≈ 1–2 weeks)
- Create/join/leave via invite link, default Clan, switching (F12–F15).
- Two leaderboards per Clan (Exercising, Traveling): Lands owned, score, weekly/monthly (F14).
- **Done when:** a user in two Clans sees different maps and boards for each.

### M7 – Hardening and beta (≈ 2 weeks)
- Privacy zone, data deletion, permission wording, App Store requirements.
- Load test at 100 users (and a 10× sanity run to check the v2 path).
- TestFlight beta with ~20 real users; tune thresholds from their data.

**Rough total:** 10–13 weeks for one developer.

## Testing approach
- The domain logic (classify, loop, score) is pure functions over fixtures, so it is unit-testable without a phone. Build a small library of recorded real Tracks early, since synthetic GPS data hides real-world noise.
- Manual field tests at each of M1, M3 and M7.

## Key risks
| Risk | Mitigation |
|---|---|
| iOS kills background tracking | M1 spike first; use `allowsBackgroundLocationUpdates` and a visible recording indicator |
| Battery drain | Adaptive sampling; measure in M1 |
| GPS noise causes false or missed loops | Tolerances tuned on real fixtures; M3 is time-boxed with a fallback to "visit-based" claiming (walk through a cell) |
| Cheating (GPS spoofing, driving while "walking") | Speed-consistency checks in v1; deeper detection later |
| Location privacy | Privacy zone, no path sharing, delete-my-data |
| Scope creep from open questions | Resolve SPEC §6 before M3 |

## Next step
Answer the open questions in `SPEC.md` §6, mainly #1 (fixed cell vs free-form polygon), since it changes M3 and M4 the most. Then I can turn each milestone into GitHub issues using the repo's triage labels.
