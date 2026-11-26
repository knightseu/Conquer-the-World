# 0005. MapLibre Native with Lands served as vector tiles

Status: accepted

## Context
The map must colour thousands of Lands by Owner, per Clan and category (F17), and the client must stay thin and portable (N1). MapKit can only draw Lands as CPU-rendered overlays (one per Owner colour) fed by GeoJSON per viewport, and nothing about it carries over to Android. See the research on [Map SDK: MapKit vs MapLibre](https://github.com/knightseu/Conquer-the-World/issues/5).

## Decision
- The iOS client uses MapLibre Native, wrapped in our own `UIViewRepresentable`.
- The basemap is OpenFreeMap.
- The server serves Lands as Mapbox Vector Tiles per Clan and category, generated in PostGIS with `ST_AsMVT`. Each feature carries its Land id and Owner, and the client styles it with data-driven `fill-color`.
- A tap reads the Land id from the rendered feature (`visibleFeatures(at:)`), so the client needs no H3 library.

## Consequences
- Owner colouring is done on the GPU and stays smooth at large Land counts.
- The Android v2 client reuses the same style, tile endpoints and basemap.
- OpenFreeMap has no SLA. If it proves unreliable, fall back to MapTiler (paid) or self-hosted Protomaps PMTiles. That swap only changes the style URL.
- The server owns a tile endpoint, and tiles have to be invalidated or kept short-lived when Ownership changes.
