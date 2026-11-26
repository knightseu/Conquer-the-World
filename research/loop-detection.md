# Research: Loop detection and cell-fill approach

Ticket: #3 (map #1). Feeds the M3 backlog. Covers SPEC F5, F6, N6; ADR 0002 (TypeScript + PostGIS + `h3-js`) and ADR 0003 (Land = H3 res-10 cell).

Date: 2026-11-25. Versions checked: `h3-js` 4.5.0 (Apache-2.0), H3 core 4.6.0 (2026-11-18), `@turf/turf` 7.4.0, `jsts` 2.12.1, PostGIS current docs, `h3-pg` current `docs/api.md`.

## Question

What algorithm and libraries should the server use to (1) detect Loops in a noisy, time-ordered GPS polyline, and (2) turn each Loop into the set of H3 res-10 Lands whose centres lie inside it, shrunk by the local GPS error margin?

## Answer in short

Treat the whole Track as a planar line arrangement rather than hunting for Loops point by point:

1. Clean and decimate the Track in a local metric projection.
2. Add short closure connectors where the path returns within an accuracy-scaled tolerance of an earlier point without crossing it.
3. Node the lines (split them at every crossing) and polygonize. Every bounded face is a Loop candidate. This handles crossings, figure-8s, several Loops, repeated laps and nested Loops in one step, and the faces are valid polygons by construction, so no repair step is needed.
4. Fill each face with H3 centre containment (`polygonToCellsExperimental(..., containmentCenter)`).
5. Apply the N6 shrink as a filter on cell centres: drop any cell whose centre is within the local `horizontalAccuracy` of a Track segment. This is mathematically the same as a variable-width negative buffer, but it never builds buffer geometry.

Do this in TypeScript (`jsts` for noding and polygonizing, `h3-js` for filling). Keep PostGIS for storage and queries. The PostGIS path (`ST_Node` + `ST_Polygonize` + `h3-pg`) is a valid equivalent but adds an extension dependency and puts geometry CPU on the database. A 1-hour Track takes about 10–100 ms end to end. Very large Travel Loops are the real cost: a 48 km-radius Loop gives about 540k Lands and takes about 6 s.

## 1. Loop detection

### 1.1 Options

| Approach | How | Verdict |
|---|---|---|
| `turf.kinks` on the Track | Returns points at self-intersections of a LineString/Polygon ([turf kinks docs](https://turfjs.org/docs/api/kinks)). The source is a naive nested loop over all segment pairs, O(n²), and skips adjacent segments ([source](https://github.com/Turfjs/turf/blob/master/packages/turf-kinks/index.ts)). | It only finds crossings. It does not find near-miss closures or build polygons. About 110 ms on 3,600 points (bench). Use it only as a diagnostic. |
| Greedy incremental detector (spatial hash; for each new point, look for a crossing or an earlier point within tolerance, emit a Loop and reset) | Custom | **Rejected after the bench.** GPS jitter makes dozens of tiny "Loops" (155 on a noisy 1 h walk). Each one resets the search, so the real 800 m Loop is never found. Making it robust means re-inventing polygonization. |
| **Arrangement: node + polygonize** | Node all line work so lines meet only at endpoints, then form faces. JTS/JSTS `Polygonizer`: "The processed edges must be correctly noded; that is, they must only meet at their endpoints" ([JTS Polygonizer javadoc](https://locationtech.github.io/jts/javadoc/org/locationtech/jts/operation/polygonize/Polygonizer.html)). PostGIS equivalent: `ST_Polygonize`, which needs noded input ("use ST_Node on the input geometry before polygonizing") ([ST_Polygonize](https://postgis.net/docs/ST_Polygonize.html), [ST_Node](https://postgis.net/docs/ST_Node.html)). | **Recommended.** Crossings become nodes automatically. Each enclosed region is a face, so figure-8s give 2 faces, and laps over the same route give overlapping faces that are deduplicated at cell level. Tiny noise faces are harmless because they hold no cell centre, and they can be skipped cheaply by area. |

### 1.2 Recommended pipeline (TypeScript)

1. **Pre-filter** the F4 rejects (accuracy > 50 m, teleports, speed spikes). Keep `horizontalAccuracy` on every point.
2. **Project** to a local metric plane centred on the Track. Turf's own buffer does the same thing: it rotates a `d3-geo` azimuthal-equidistant projection to the feature centre, runs JSTS `BufferOp` in metres, then inverts ([turf-buffer source](https://github.com/Turfjs/turf/blob/master/packages/turf-buffer/index.ts)). PostGIS geography buffering likewise picks a best-fit planar SRID (UTM, LAEA polar, then Mercator) and warns about objects "much larger than a UTM zone or [crossing] the dateline" ([ST_Buffer](https://postgis.net/docs/ST_Buffer.html)).
3. **Decimate:** keep a point only if it is at least `max(10 m, acc_prev, acc_cur)` from the last kept point, and **always keep the final point**. Without the last point, an end-of-Track closure can be missed; the first bench run lost a whole Loop this way. Decimation cut noding time on a noisy 1 h walk from 373 ms to 50 ms, and the face count from 4,366 to 826, with the same cell result (bench).
4. **Closure connectors (F6):** where the path comes back within `tol = max(30 m, k·√(acc_i² + acc_j²))` of an earlier point `j`, and the distance travelled along the path since `j` is at least `minGap`, add a straight segment `i→j`. Combining the two accuracies in quadrature is the usual way to add independent errors; `k ≈ 1.5` is a placeholder. This replaces the fixed 30 m, as N6 requires. The bench only implements the "Track end returns near an earlier point" case. The general case (mid-Track near-misses) needs the same spatial-hash search, emitting the closest point of each re-entry episode.
5. **Node and polygonize:** `jsts.operation.union.UnaryUnionOp.union(multiLineString)` nodes all crossings, then `new jsts.operation.polygonize.Polygonizer()` → `getPolygons()`. Dangles (out-and-back spurs) and cut edges are dropped automatically. The Polygonizer reports them separately ([javadoc](https://locationtech.github.io/jts/javadoc/org/locationtech/jts/operation/polygonize/Polygonizer.html)).
6. **Loop validity (F6):** a face is a valid Loop if at least 1 Land survives the shrink (section 2). Skip faces with an area under about 5,000 m² before calling H3, since they cannot hold a centre after the shrink.

### 1.3 Polygon validity and repair

- Faces from the Polygonizer are valid simple polygons, so no repair is needed on the recommended path.
- If a Loop ring is ever built directly (for example, a `slice(j, i)` of points), it can self-intersect. Repair options:
  - PostGIS `ST_MakeValid(geom, 'method=structure')` unions exterior rings and differences interior rings. It needs PostGIS 3.2+ and GEOS 3.10+. "Single polygons may become multi-geometries in case of self-intersections" ([ST_MakeValid](https://postgis.net/docs/ST_MakeValid.html)).
  - `ST_BuildArea` also needs noded input ([ST_BuildArea](https://postgis.net/docs/ST_BuildArea.html)).
- **Do not use `buffer(0)` to repair figure-8s.** In the bench, JSTS `buffer(0)` on a 10×10 bowtie returned an area of 25, which is one lobe of two (total 50), so a lobe was silently dropped. PostGIS also recommends `ST_MakeValid` over buffer-0 ([ST_Buffer](https://postgis.net/docs/ST_Buffer.html)). `GeometryFixer` was not found at `jsts.geom.util` in the npm 2.12.1 build.

## 2. Cell fill with the N6 shrink

### 2.1 H3 containment semantics

- `polygonToCells`: "Containment is determined by centroids of the cells" ([H3 regions API](https://h3geo.org/docs/api/regions)). This is exactly the F5 "centre lies inside" rule, and a partition of polygons yields a partition of cells.
- `polygonToCellsExperimental` (H3 4.2.0, 2024-12-04): "supports more containment flags and is more memory-efficient" ([H3 CHANGELOG](https://github.com/uber/h3/blob/master/CHANGELOG.md)). The modes are `CONTAINMENT_CENTER`, `FULL`, `OVERLAPPING` and `OVERLAPPING_BBOX` ([regions API](https://h3geo.org/docs/api/regions)). H3 4.6.0 fixed slow cases on thin, degenerate and tiny polygons.
- `h3-js` signature: `polygonToCells(coordinates, res, [isGeoJson])` and `polygonToCellsExperimental(coordinates, res, flags, [isGeoJson])`. The first loop is the outer ring and later loops are holes. The default order is `[lat, lng]` unless `isGeoJson` is set. It throws `H3Error` if "output is too large for JS" ([h3-js README](https://github.com/uber/h3-js/blob/master/README.md)). There is no MultiPolygon input, so call it once per face.

### 2.2 Applying the shrink

Requirement: claim cell `c` only if its centre is inside the Loop **and** farther than the local error `r_s` from the Loop boundary.

| Option | Notes |
|---|---|
| Negative buffer by one radius, e.g. `turf.buffer(poly, -maxAcc, {units:'meters'})` | Turf allows negative radii but warns "the resulting geometry may be invalid if it's too small compared to the radius magnitude" ([turf buffer](https://turfjs.org/docs/api/buffer)). PostGIS `ST_Buffer` with a negative distance shrinks, and may return `POLYGON EMPTY` ([ST_Buffer](https://postgis.net/docs/ST_Buffer.html)). With one radius (the max or a percentile), one 35 m patch over-shrinks the whole Loop. Slowest option in the bench: 432 ms on a 3,300-vertex ring. |
| Variable negative buffer: `poly − ∪ buffer(segment_s, r_s)` | Correct for "local" error, but needs thousands of small buffers plus a cascaded union. Expensive and fragile. |
| **Centre filter (recommended)** | Fill with centre containment, then drop a cell if `dist(centre, segment_s) ≤ r_s` for any Track segment `s`. Use `r_s = max(acc)` of the segment's endpoints, and find nearby segments with a uniform grid or `flatbush`. This gives the same set as the variable buffer under the centre rule, because a centre is inside `P − ∪ buffer(s, r_s)` exactly when it is in `P` and outside every disc. Cost is about 1 µs per cell, near zero next to the fill. Use the closure-connector endpoints' accuracy for the connector segments. |

Faces from one Track are combined with a `Set<H3Index>`, so overlapping laps are not double-counted.

### 2.3 Cell size caveat (affects ADR 0003 / TODO)

The H3 res-10 *average* is 15,047.5 m² with a 75.9 m average edge ([H3 resolution table](https://h3geo.org/docs/core-library/restable)). The SPEC's "~65 m edge" is below that average. Real cells vary with location (`h3.cellArea` / `edgeLength`, bench):

| Location | Cell area | Edge |
|---|---|---|
| Oslo | 10,778 m² | 61.6 m |
| London | 13,454 m² | 69.0 m |
| Singapore | 17,095 m² | 81.2 m |

Expected Land counts per Loop therefore vary by about ±25% by latitude.

## 3. TypeScript vs PostGIS

| | TypeScript (`jsts` + `h3-js`) | PostGIS (`ST_Node`/`ST_Polygonize` + `h3-pg`) |
|---|---|---|
| Noding / faces | `UnaryUnionOp` + `Polygonizer` (a JTS port, same algorithms as GEOS) | `ST_Polygonize(ST_Node(geom))`; `ST_UnaryUnion` with `gridSize` gives "more robust output" ([ST_Node](https://postgis.net/docs/ST_Node.html)) |
| Fill | `polygonToCellsExperimental(rings, 10, containmentCenter, true)` | `h3_polygon_to_cells_experimental(geom, 10, 'center')` (h3-pg ≥ 4.2.0); geometry "should be in SRID 4326", otherwise it errors ([h3-pg API](https://github.com/zachasme/h3-pg/blob/main/docs/api.md)) |
| Shrink filter | Custom grid distance check (≈30 lines) | `NOT EXISTS (… ST_DWithin(cell_centre, segment, acc))` with a GiST index on segments: expressive but more SQL to tune |
| Testability | Pure functions with fast unit tests (fits the TDD workflow) | Needs a DB in tests |
| Deploy | npm only | Needs the `h3-pg` extension on the Postgres host (availability on the chosen managed Postgres not verified) |
| Scale (N4) | CPU on stateless workers, so it scales out with the v2 queue | CPU on the primary DB, which competes with leaderboard queries |
| Fit with ADR 0002 | Direct: "Server is TypeScript (Node), with Postgres + PostGIS and `h3-js`" | Partial: adds an extension |

**Recommendation:** compute in TypeScript and keep the algorithm in one pure module (`track → Loop faces → Land set`). Use PostGIS for storing Tracks/Claims and for spatial queries. Use it as a cross-check oracle in tests if `h3-pg` is available.

## 4. Performance (bench)

Setup: Node 22, Apple Silicon laptop, synthetic Tracks near London at 1 Hz. Noise is i.i.d. Gaussian with σ = acc/2; "city" accuracy alternates 35 m for 2 min and 8 m for 8 min. Script: `research/loop-detection-bench.mjs` (run `node loop-detection-bench.mjs <dir-with-node_modules>`; needs `h3-js@4.5.0 jsts@2.12.1`).

| Scenario (pts) | Node+polygonize | Fill + shrink | Lands (raw → kept) | Check |
|---|---|---|---|---|
| Walk 1 h circle r = 800 m (3,600 raw) | 373 ms | 25 ms | 151 → 140 | ideal ≈ 2.01 km² / 13,454 m² ≈ 150 |
| Same, decimated (991) | **50 ms** | **6 ms** | 149 → 141 | |
| Walk 1 h figure-8, Gerono a = 1,200 m (1,103 dec.) | 18 ms | 4 ms | 142 → 128 | ideal 4a²/3 ≈ 143 |
| Walk C-shape, stops ~25 m short of start (882 dec.) | 9 ms | 2 ms | 149 → 148 | closure connector works |
| Drive 1 h circle r = 9.5 km (3,287 dec.) | 8 ms | 79 ms | 21,076 → 21,019 | ideal 21,072 |

Fill-only comparison on the 1 h drive Loop (21k Lands): `polygonToCells` 188 ms, `polygonToCellsExperimental(center)` 77 ms, and `turf.buffer(-acc)` + `polygonToCells` 432 ms. All return the same set.

**Very large Loops** (5 h drive, r = 48 km, 16k vertices): 538,024 Lands. `polygonToCells` took 17.3 s and the experimental version 5.8 s. Loop detection was still only about 4 ms. At this size the cost is the cell count, not geometry. It also produces 538k Claim rows per Track (see risks).

## 5. Open risks and follow-ups for M3

1. **Huge Travel Loops.** Fill cost and Claim row count grow with area. Options:
   - Cap Loop area or perimeter per movement type.
   - Process asynchronously (the v2 queue).
   - Store Claims compacted (`compactCells`) and expand on read. This conflicts with simple per-Land rows (ADR 0003).
   
   This needs an owner decision.
2. **Synthetic noise is optimistic.** Real GPS error is time-correlated (multipath drift), not i.i.d. Re-run the pipeline on field Tracks (TODO "choose resolution from field data") and tune `k`, `minGap`, the decimation floor and the 5,000 m² face cut-off.
3. **Mid-Track near-miss closures.** Only the end-of-Track case is implemented in the bench. The general case needs episode logic, so one connector is emitted per return and not one per nearby point. Too many connectors could create spurious faces between parallel out-and-back paths that are closer than `tol`. Mitigate with `minGap` and by requiring the connector to be the closest approach of the episode.
4. **Nested / enclosed faces.** Polygonizer returns *all* bounded faces. An island face enclosed by a larger Loop is therefore claimed too, which matches "encloses an area". A lasso or "spur inside a Loop" is dropped as a dangle. Confirm this matches the owner's intent.
5. **Projection.** A local azimuthal-equidistant plane is fine at Track scale. Loops near the antimeridian or poles, or spanning hundreds of km, need care. h3-pg needs SRID 4326 input.
6. **Robustness.** JSTS noding uses floating point. Add a snap/grid size (as `ST_UnaryUnion(geom, gridSize)` offers) if `TopologyException`s appear on real data. The bench saw none.
7. **SPEC wording.** "~65 m edge" for res 10 is below H3's published 75.9 m average edge. Local cells run 62–81 m (section 2.3). Consider correcting SPEC/ADR 0003.

## Sources

- H3 regions API (polygonToCells, experimental, containment modes): https://h3geo.org/docs/api/regions
- H3 resolution table: https://h3geo.org/docs/core-library/restable
- H3 CHANGELOG: https://github.com/uber/h3/blob/master/CHANGELOG.md
- h3-js README / API: https://github.com/uber/h3-js/blob/master/README.md
- h3-pg API: https://github.com/zachasme/h3-pg/blob/main/docs/api.md
- Turf kinks docs and source: https://turfjs.org/docs/api/kinks, https://github.com/Turfjs/turf/blob/master/packages/turf-kinks/index.ts
- Turf buffer docs and source: https://turfjs.org/docs/api/buffer, https://github.com/Turfjs/turf/blob/master/packages/turf-buffer/index.ts
- JTS Polygonizer: https://locationtech.github.io/jts/javadoc/org/locationtech/jts/operation/polygonize/Polygonizer.html
- PostGIS: https://postgis.net/docs/ST_Buffer.html, https://postgis.net/docs/ST_MakeValid.html, https://postgis.net/docs/ST_Polygonize.html, https://postgis.net/docs/ST_Node.html, https://postgis.net/docs/ST_BuildArea.html
- Bench (this repo): `research/loop-detection-bench.mjs`
