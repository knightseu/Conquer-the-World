# Map SDK: MapKit vs MapLibre Native

Research for issue #5. Context: SPEC F16–F18a (map of the user's location, own Tracks, Land cells coloured per Owner, tap a Land for detail, others see only claimed Lands), N1 (thin clients, Android in v2), ADR 0001 (native SwiftUI), ADR 0003 (Land = H3 res-10 cell, ~15,000 m²). Minimum iOS is 17.

This file gathers facts and gives a recommendation. **The decision is not taken here.** It is taken in issue #6 "Server stack and hosting", because the choice decides what the server must serve (GeoJSON per viewport or vector tiles) and whether we pay for or host a basemap.

Sources were read on 2026-11-25. Facts not confirmed against a primary source are marked **[unverified]**.

## Summary

| Question | MapKit (SwiftUI `Map` / `MKMapView`) | MapLibre Native iOS |
|---|---|---|
| Version / min iOS | SwiftUI `MapPolygon`, `MapReader`, `MapProxy` are iOS 17.0+ [A1][A2] | v7.1.0 (2026-11-25); min iOS 15.5 since 7.0.0 [M1][M2] |
| Licence / cost of SDK | Part of the iOS SDK; no SDK fee for native maps **[unverified: Apple's pages read do not state native quotas]** | BSD-2-Clause [M3] |
| Basemap tiles | Apple Maps, included | Bring your own: OpenFreeMap (free, no SLA), MapTiler, Stadia, or self-hosted Protomaps PMTiles (see Tile sources) |
| Drawing thousands of hexes | One overlay per polygon, or group same-style polygons in `MKMultiPolygon` (iOS 13+) "when you have multiple distinct polygon shapes that you intend to render using the same style" [A3]. Overlay renderers are drawn by the map in tiles on background threads [A4]. Colour per Owner = one multipolygon per colour. | One `MLNShapeSource` (GeoJSON) "optimized for data sets that change dynamically and fit completely in memory" [M4] + one fill layer whose `fill-color` is a data-driven expression on a feature property (supports feature-state) [M5]. Or vector tiles from the server. |
| Vector tiles from our server | No. Only raster `MKTileOverlay` (bitmap tiles) [A5] | Yes (MVT); PostGIS `ST_AsMVT` (2.4.0+) produces them [P1] |
| Tap on a Land | `MapReader` + `MapProxy.convert(_:from:)` turns a screen point into a coordinate [A2][A6]. Selection via `.tag` is for selectable map content (markers/annotations) [A7]; no documented polygon hit-test in SwiftUI `Map`. | `visibleFeatures(at:styleLayerIdentifiers:)` returns rendered features at a point [M6] |
| Offline | No offline-region API found in the MapKit docs (searched framework and `MKMapView` pages) | `MLNOfflineStorage` offline packs + ambient cache (default 50 MB) [M7]. PMTiles sources do not support offline packs or caching [M8]. |
| SwiftUI | First-class: `Map { MapPolygon(...) .foregroundStyle(...) }` [A1][A8] | UIKit `MLNMapView`; wrap in `UIViewRepresentable`, or use `maplibre/swiftui-dsl` (v0.28.0, pre-1.0, "not yet committed to API stability", layers/sources "incomplete") [M9] |
| Android carry-over (v2) | None: no native Android MapKit SDK; MapKit JS is web-only [A9] | MapLibre Native Android shares the same core and style spec; style JSON, data-driven expressions and tile/GeoJSON endpoints carry over (fill-color support table lists Android, iOS, JS) [M5][M10] |

## Detail

### Rendering thousands of coloured H3 cells

- No primary source gives a polygon-count limit or benchmark for either SDK. Performance must be measured in a prototype (see open questions).
- Scale estimate from ADR 0003: res-10 cell ≈ 15,000 m², so a 5 km × 5 km view holds ≈ 1,700 cells; a city-wide zoom holds tens of thousands. Both SDKs will need the server to send only cells in the viewport, and probably to aggregate to a coarser H3 parent at low zoom.
- **MapKit:** `MKMultiPolygon` + `MKMultiPolygonRenderer` (iOS 13+) render many polygons with one style [A3]. So the natural model is one overlay per Owner colour. Renderers draw on the CPU via `draw(_:zoomScale:in:)`, which "the map view may tile ... and distribute ... to separate threads" [A4]. SwiftUI `MapPolygon` (iOS 17) is one polygon per content item [A1]; thousands of them in a SwiftUI result builder is untested here.
- **MapLibre:** one GeoJSON source for all visible cells, one fill layer, colour from a feature property (`ownerColor`) via a data-driven expression [M5]. Updating = set the source's `shape`/`URL` [M4]. Rendering is GPU (Metal backend in current releases [M2]). Alternatively the server serves MVT tiles (`ST_AsMVT` [P1]) and the client just points a vector source at them.

### Tap hit-testing on a Land

- Works the same way in both and needs no polygon hit-test: convert the tap to a coordinate (`MapProxy.convert(_:from:)` [A6] / `MLNMapView.convert(_:toCoordinateFrom:)`), compute the H3 res-10 index of that coordinate, and request that Land from the API. This needs an H3 library on the client (Swift bindings exist **[unverified]**) or a server endpoint `GET /lands/at?lat&lng`. The server option keeps clients thin (N1).
- MapLibre also offers `visibleFeatures(at:)` returning the rendered feature (with its H3 index as a property) [M6].

### Tile sources and cost for MapLibre

| Provider | Free tier | Paid | Notes |
|---|---|---|---|
| OpenFreeMap | Free, "no limits on the number of map views or requests", no API key, commercial use "Yes" | n/a | "I don't offer SLA guarantees"; offline downloads limited to 3,000 tiles / 50 MB [T1] |
| MapTiler Cloud | 5k sessions/month, 100k API requests; for "testing, PoC, prototyping, personal, or non-commercial use"; service pauses at quota | Flex $30/month: 25k sessions, 500k requests | Session = "a webpage or mobile-app load which contains a map initialization" [T2] |
| Stadia Maps | 200,000 credits/month, "Commercial use not allowed" | Starter $20/month (1M credits), Standard $80 (7.5M) | [T3] |
| Protomaps (self-host) | Basemap as a single PMTiles archive read over HTTP range requests; data under ODbL (OSM) | Object storage + CDN cost only | [T4]; MapLibre Native reads `pmtiles://` (Android 11.7.0+) but no offline packs or caching for PMTiles [M8] |
| tile.openstreetmap.org | Not suitable: "Offline use is not permitted", best effort, "no SLA" | n/a | [T5] |

v1 is 100 users and free (README). OpenFreeMap or MapTiler Free covers that load; MapTiler's free tier is non-commercial, so it is a prototype choice only. OSM attribution is required for all OSM-based tiles (ODbL) [T4][T5].

### Offline

- MapKit: no public offline-region API in the docs searched. Previously viewed tiles may be cached by the system **[unverified]**.
- MapLibre: offline packs via `MLNOfflineStorage` (`addPack`, resume to download), tile cap via `setMaximumAllowedMapboxTiles:`, ambient cache 50 MB default [M7]. Provider terms limit this (OpenFreeMap 3,000 tiles per download [T1]; OSM forbids it [T5]).
- For this app, offline matters less for the basemap than for GPS recording, which works without a map. Lands need the API anyway.

### SwiftUI integration

- MapKit for SwiftUI (iOS 17) is declarative: `Map(position:selection:) { UserAnnotation(); MapPolyline(...); MapPolygon(...) }` [A8][A1]. Track lines (`MapPolyline`) and user location (`UserAnnotation`) are built in [A8].
- MapLibre: `MLNMapView` in `UIViewRepresentable` (about 100–200 lines of glue, **[unverified estimate]**), or the community-maintained but official-org `swiftui-dsl` (pre-1.0, iOS 15.5+) [M9].

### Android in v2 (N1)

- MapKit: Android must adopt a different SDK; only the server API carries over. Apple offers MapKit JS for websites, including on Android browsers, not a native SDK [A9].
- MapLibre: Android SDK v13.8.0 (2026-11-26) from the same repo [M10]. Same style JSON, same expressions, same GeoJSON/MVT endpoints and same tile provider. Only the view glue is rewritten.

## Recommendation (input to #6)

**MapLibre Native**, with OpenFreeMap as the v1 basemap and MapTiler (paid) or self-hosted Protomaps as the fallback once an SLA matters. Reasons:

1. Colouring per Owner is one data-driven layer over one source, rendered on the GPU. This is the core of F17 and scales to tens of thousands of cells. MapKit needs one overlay per colour, drawn on the CPU.
2. It lets the server serve Lands as vector tiles (`ST_AsMVT` on PostGIS, already chosen in ADR 0002). That makes Land rendering cacheable and identical on iOS, Android and web.
3. Style and data contract carry over to Android v2 unchanged (N1).

Costs to accept: a third-party dependency (BSD-2), SwiftUI glue (UIKit wrapper or pre-1.0 DSL), a basemap provider with no SLA on the free option, and OSM attribution.

**When MapKit is the better pick:** if #6 settles on plain GeoJSON per viewport and the prototype shows MapKit `MKMultiPolygon`-per-colour stays smooth at the expected cell counts, MapKit is zero-cost, zero-dependency, and best in SwiftUI. That is a valid v1 choice, but Android v2 would then need a new map stack.

Tap handling (coordinate → H3 index → API) is the same for both and does not decide the question.

## Open questions

- Prototype: frame rate of ~2,000 and ~20,000 coloured res-10 hexes in MapKit (`MKMultiPolygon` per colour, and SwiftUI `MapPolygon`) vs MapLibre (one GeoJSON source) on an older supported iPhone.
- #6: GeoJSON-per-viewport vs MVT endpoint; low-zoom aggregation to H3 parents.
- Client H3 library vs server `lands/at` lookup for taps.
- Basemap SLA needed in v1, or is OpenFreeMap acceptable?

## Sources

Apple (developer.apple.com, read via the docs JSON endpoints):
- [A1] MapPolygon, iOS 17.0+: https://developer.apple.com/documentation/mapkit/mappolygon
- [A2] MapReader / MapProxy, iOS 17.0+: https://developer.apple.com/documentation/mapkit/mapreader, https://developer.apple.com/documentation/mapkit/mapproxy
- [A3] MKMultiPolygon / MKMultiPolygonRenderer, iOS 13.0+: https://developer.apple.com/documentation/mapkit/mkmultipolygon
- [A4] MKOverlayRenderer: https://developer.apple.com/documentation/mapkit/mkoverlayrenderer
- [A5] MKTileOverlay ("tiles of bitmap images"): https://developer.apple.com/documentation/mapkit/mktileoverlay
- [A6] MapProxy.convert(_:from:): https://developer.apple.com/documentation/mapkit/mapproxy/convert(_:from:)
- [A7] MapContent.tag(_:): https://developer.apple.com/documentation/mapkit/mapcontent/tag(_:)
- [A8] Map (SwiftUI): https://developer.apple.com/documentation/mapkit/map
- [A9] Apple Maps for developers: https://developer.apple.com/maps/

MapLibre:
- [M1] Releases (ios-v7.1.0, 2026-11-25): https://github.com/maplibre/maplibre-native/releases and SPM package https://github.com/maplibre/maplibre-gl-native-distribution
- [M2] iOS CHANGELOG, 7.0.0 "Raise the minimum supported iOS version to 15.5": https://github.com/maplibre/maplibre-native/blob/ios-v7.1.0/platform/ios/CHANGELOG.md
- [M3] Licence BSD-2-Clause: https://github.com/maplibre/maplibre-native
- [M4] MLNShapeSource.h: https://github.com/maplibre/maplibre-native/blob/ios-v7.1.0/platform/darwin/src/MLNShapeSource.h
- [M5] Style spec, fill-color (data-driven, feature-state; Android/iOS/JS support): https://maplibre.org/maplibre-style-spec/layers/
- [M6] MLNMapView.h `visibleFeatures(at:)`: https://github.com/maplibre/maplibre-native/blob/ios-v7.1.0/platform/ios/src/MLNMapView.h
- [M7] MLNOfflineStorage.h: https://github.com/maplibre/maplibre-native/blob/ios-v7.1.0/platform/darwin/src/MLNOfflineStorage.h
- [M8] PMTiles example: https://maplibre.org/maplibre-native/android/examples/data/PMTiles/
- [M9] swiftui-dsl README: https://github.com/maplibre/swiftui-dsl
- [M10] android-v13.8.0 release: https://github.com/maplibre/maplibre-native/releases

Tiles and server:
- [T1] OpenFreeMap: https://openfreemap.org/
- [T2] MapTiler Cloud pricing: https://www.maptiler.com/cloud/pricing/
- [T3] Stadia Maps pricing: https://stadiamaps.com/pricing/
- [T4] Protomaps docs: https://docs.protomaps.com/
- [T5] OSMF tile usage policy: https://operations.osmfoundation.org/policies/tiles/
- [P1] PostGIS ST_AsMVT (2.4.0+): https://postgis.net/docs/ST_AsMVT.html
