# Conquer the World – iOS app

SwiftUI, iOS 17+. The project is generated from `project.yml` with XcodeGen:

```sh
brew install xcodegen
cd app-ios && xcodegen generate && open ConquerTheWorld.xcodeproj
```

- `ConquerTheWorld/Recording/` – background Track recording: `CLLocationUpdate.liveUpdates(.fitness)` with a held `CLBackgroundActivitySession`, When In Use permission only, a disk-backed point queue (`PointStore`, JSONL per Track), and Core Motion hints queried at stop.
- `ConquerTheWorld/Map/` – MapLibre map with the OpenFreeMap basemap (ADR 0005).
- `ConquerTheWorld/API/` – client generated at build time by `swift-openapi-generator` from `openapi.yaml`, a symlink to `../../../api/openapi.yaml`.

Build settings: `API_BASE_URL` (Debug: `http://localhost:3000`; Release: the Render URL), `SENTRY_DSN` (empty disables Sentry). The bundle ID prefix is a placeholder (see `TODO.md`).

Not built yet: Track upload (waits on the API contract), Sign in with Apple, Land tiles on the map.
