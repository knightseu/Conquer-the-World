# Conquer the World – Specification (v1 FINAL)

Status: **final for v1**, confirmed by the owner on 2026-11-21. Changes after this point need an explicit decision and a note in the relevant ADR or `TODO.md`.

Derived from `README.md`. Decisions made explicitly by the owner are marked **[DECIDED]**. Items marked **[ASSUMPTION]** are provisional defaults accepted for v1 and tracked for tuning in `TODO.md`.

## 1. Concepts

| Term | Definition |
|---|---|
| **Land** | A fixed map cell: an H3 hexagon at resolution 10 (~65 m edge, ~15,000 m²), provisional until field data exists. The unit that is claimed, scored and owned. |
| **Parcel** | A real-world named place (park, neighbourhood, city) made of Lands. **[DECIDED]** The design is parcel-plus-cell, but the parcel layer is not in v1 (see §5). |
| **Track** | One continuous recording session from start to stop: a time-ordered list of GPS points. |
| **Segment** | A part of a Track with one movement type. |
| **Movement type** | walk, run, hike, cycle or drive. Each belongs to one score category (see 2.3). |
| **Loop** | A Track portion where the path returns near an earlier point on the same Track and so encloses an area. |
| **Claim** | A user's relationship to a Land, created when a Loop encloses it. A Claim is made in one score category. |
| **Exercise score** | **[DECIDED]** Score earned by walking, running, hiking and cycling. |
| **Travel score** | **[DECIDED]** Score earned by driving. Kept separate from Exercise score. Never rots. |
| **Rot** | The decay of an Exercise score on a Land when the user does not revisit it (see F10). |
| **Owner** | The user with the highest score on a Land within a given Clan, per score category. A Land can have an Exercise owner and a different Travel owner. |
| **Clan** | **[DECIDED]** A set of users sharing a map and leaderboards. |

## 2. Functional requirements

### 2.1 Tracking
- F1. User can start/stop a Track; recording continues with the app in the background and the screen locked.
- F2. App samples GPS and uploads points in batches. It must work offline and sync later.
- F3. Movement type is classified automatically from speed (and motion-sensor data where available). **[ASSUMPTION]** Placeholder thresholds, to be tuned (**[DECIDED]**: deferred):
  - walk < 7 km/h
  - run 7–15 km/h
  - cycle 15–35 km/h
  - drive > 35 km/h
  - hike = walk with sustained elevation gain
  - The user can correct a Segment's type afterwards.
- F4. Implausible points (accuracy > 50 m, teleporting, speed spikes) are discarded.

### 2.2 Claiming
- F5. When a Track forms a Loop, all Lands whose centre lies inside the Loop polygon (shrunk by the local GPS error margin, see N6) are claimed by that user.
- F6. **[ASSUMPTION]** A Loop is valid if the path closes within a tolerance (placeholder 30 m, scaled by GPS accuracy) of an earlier point and encloses at least 1 Land. It can be made at any movement type; the type decides the score category.
- F7. Claims are evaluated server-side after upload, so the algorithm can change without an app release.

### 2.3 Scoring
- F8. **[DECIDED]** There are two separate score categories:
  - **Exercise:** walk, run, hike and cycle.
  - **Travel:** drive.
- F9. **[DECIDED]** A Claim earns score per day held: the longer the Land stays claimed, the higher the score. **All movement types weigh the same for now**; weights are deferred. `score(land, user, category) = Σ over days claimed of 1`.
- F10. **[DECIDED]** Exercise scores never expire, but they **rot**. **[ASSUMPTION]** Rot is a continuous half-life: `effective score = score × 0.5^(days since the user last visited that Land ÷ 365)`, so a Land not visited for 1 year is worth half. Revisiting stops further rot. The rot clock is per Land. **[DECIDED]** Travel scores do not rot. The rot mechanism will be revisited (see TODO.md).
- F11. Anti-abuse: a Track whose Segments contradict the claimed movement type (e.g. "walking" at 60 km/h) earns no score.

### 2.4 Clans and leaderboards
- F12. A user can create, join (invite code/link) and leave Clans, and belong to many.
- F13. User picks a default Clan and can switch at any time.
- F14. **[DECIDED]** Each Clan has two leaderboards: **Exercising** and **Traveling**. Each ranks by Lands currently owned in that category; total score in that category is available as a second view. **[ASSUMPTION]** Weekly/monthly boards are shown alongside all-time.
- F15. Per-Clan scores are independent: the same Track counts in every Clan the user belongs to.

### 2.5 Map
- F16. Map shows the user's location, recorded Tracks (own only), and Land cells.
- F17. Each Land is coloured by its Owner in the selected Clan. **[ASSUMPTION]** A toggle switches between the Exercising and Traveling owner. Tapping a Land shows owners, scores and claim history.
- F18. Unclaimed Lands are neutral.
- F18a. **[DECIDED]** Other Clan members see only claimed Lands. Live movement and paths are never shown to others.

### 2.6 Accounts
- F19. Sign in with Apple (required on iOS). Profile: display name, avatar colour.

## 3. Non-functional requirements

| Area | v1 | v2 | v3 |
|---|---|---|---|
| Users | 100 | 10,000 | unbounded |
| Platform | iOS (iPhone) | + Android | + others |
| Cost to user | free | free/freemium | TBD |

- N1. **Portability:** all domain logic (movement classification post-processing, loop detection, scoring, rot, ownership) lives on the server behind a documented HTTP API (OpenAPI). Clients only collect GPS, render maps, and call the API. Adding Android means writing a new client, not re-implementing rules.
- N2. **Battery:** a one-hour Track should use ≤ 10% battery on a recent iPhone. Use significant-change and adaptive sampling.
- N3. **Privacy:** location data is sensitive. Raw Tracks are visible only to their owner. Other Clan members see claimed Lands, not paths or live position. Users can delete their data. Optional "home privacy zone" that never claims or displays Lands within a set radius of home. Location permission text must clearly explain background use.
- N4. **Scale path:** v1 single service + Postgres/PostGIS. v2 adds a queue for claim processing and read replicas. v3 shards by H3 parent cell. The Land = H3 cell choice is what makes the v3 sharding possible.
- N5. **Availability:** recording must never depend on network; the server may be down without losing data.
- N6. **Accuracy:** consumer GPS is ~5–10 m in the open and 20–50 m or worse in cities and under cover, while a Land is ~65 m across. Therefore: weight points by reported `horizontalAccuracy` (not just discard bad fixes); shrink a Loop polygon by the local error margin before filling cells, so we under-claim rather than over-claim; scale the loop-closure tolerance with measured accuracy instead of a fixed 30 m; and choose the cell resolution from real field data (see TODO.md).

## 4. Business model (discussion, not v1 scope)
Candidates, in order of my preference:
1. **Freemium subscription:** free for 1 Clan and basic stats. Paid for unlimited Clans, history, advanced stats, custom map themes.
2. **Sponsored/brand Clans:** companies and running clubs pay for private Clans and challenges.
3. **Partnerships:** outdoor retail, tourism boards (e.g. "claim all trails in this park").
Avoid selling location data: it conflicts with the privacy promise and with App Store policy.

## 5. Out of scope for v1
- **[DECIDED]** Real-world Parcels and Occupation Percentage. The data model must not prevent adding a Parcel layer over Lands later.
- Android, social feeds/chat, in-app purchases, wearable (Apple Watch) recording, route sharing, live tracking of other users.

## 6. Open questions
Resolved on the owner's decisions: Land model (parcel-plus-cell), driving scores in a separate Travel category, rot instead of expiry (half after 1 year, to be revisited), Clan name, only claimed Lands visible, parcels out of v1, weights/thresholds deferred.

Also resolved: run and cycle count as Exercise; Travel score does not rot; the rot clock is per Land.

No open questions remain for v1.
