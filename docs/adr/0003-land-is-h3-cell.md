# 0003. Parcel-plus-cell: a Land is an H3 resolution-10 cell

Status: accepted (owner decision: parcel-plus-cell). Parcel layer and Occupation Percentage are out of v1, see `TODO.md`.

## Context
Ownership, scoring and map rendering need a stable unit. Free-form enclosed polygons overlap and fragment, which makes "owner of a land" ill-defined and expensive to query.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Free-form polygons (shape of the loop) | Matches "walk around it" literally | Overlap and fragmentation; ownership ill-defined; heaviest PostGIS load |
| Square grid (geohash, S2, Mercator tiles) | Simple maths | Size distorts with latitude; neighbours not equidistant; no strong advantage over H3 |
| **H3 hexagons** | Equal-distance neighbours, hierarchy, mature libraries, natural v3 shard key | Arbitrary shapes; edge artefacts from centre-in-polygon claiming |
| Real-world parcels (parks, neighbourhoods) | Meaningful; motivating | Uneven sizes break fair scoring; needs external data; absent in remote areas |
| Visit-based cells (no loop needed) | Simplest; robust to GPS noise | Drops the "walk around it" mechanic |

## Decision
A Land is an H3 hexagon at resolution 10 (~65 m edge, ~15,000 m²). A Loop claims every cell inside it (shrunk by the local GPS error margin, see SPEC N6). Resolution is provisional until field data exists.

Owner decision: parcel-plus-cell. Real-world Parcels will be a named layer over cells, never the scoring unit. v1 ships cells only; the data model must not prevent adding Parcels later.

## Consequences
- Ownership and scores are simple keyed rows; leaderboards are aggregate queries.
- H3 parent cells give a natural sharding key for v3.
- GPS error versus cell size is a real risk; resolution must be validated in M1/M3.
- A later Parcel layer needs a cell-to-parcel mapping and a parcel data source (see TODO.md).
