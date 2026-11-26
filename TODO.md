# Conquer the World – TODO (deferred / unverified)

No implementation is planned for now. These items were left open on purpose.

## Unverified (M0, issue #2)
- [ ] Install `xcodegen` (`brew install xcodegen`); it was not installed locally.
- [ ] Generate the Xcode project: `cd app-ios && xcodegen generate`.
- [ ] Run `xcodebuild build -project ConquerTheWorld.xcodeproj -scheme ConquerTheWorld -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`. Only a `swiftc -typecheck` against the iOS 17 simulator SDK has been done.
- [ ] Run the app against the local server (`cd server && npm run dev`) and confirm it shows `Server: ok`. This is the done condition for #2.
- [ ] Push and confirm the GitHub Actions workflow `.github/workflows/ci.yml` passes (both `server` and `ios` jobs). It has never run.

## Deferred decisions
- [ ] **Bundle ID:** `app-ios/project.yml` uses the placeholder prefix `com.example.conquertheworld`. Decide the real one before any TestFlight/App Store work (M7) or code signing.
- [ ] **Revisit the rot mechanism** (SPEC F10). Currently a provisional continuous half-life: Exercise score halves after 1 year without a visit. Revisit the curve. (Decided: the clock is per Land and Travel score does not rot.)
- [ ] Tune score weights and movement thresholds (deferred; all weights equal for now).
- [ ] **Occupation Percentage** (user progress per place): out of v1, decided by owner. Open sub-questions when revisited: denominator = claimable area (exclude water, buildings, private land) rather than total area; Explored % (ever claimed, only grows) vs Owned % (currently owned, contestable); treat ≥95% as 100%.
- [ ] **Real-world parcels** (out of v1, decided) (parks, neighbourhoods, cities) as a named layer over H3 cells, to motivate users. Needs a data source and licence decision (OpenStreetMap ODbL or Overture), a cell-to-parcel mapping, and an H3 res-7 fallback where no parcel data exists. Not yet in SPEC or PLAN.
- [ ] **Cell resolution** (res 10 ≈ 65 m vs res 11 ≈ 25 m): choose after M1 field data on real GPS error. Rule of thumb: cell edge ≥ 3× the 95th-percentile error.
