# iOS background location on iOS 17+

Research for issue #4 (map #1). Feeds the M1 recording spike (SPEC F1, F2, F3, N2, N3, N5).
Researched 2026-11-25 against Apple developer documentation, WWDC23 session 10180, WWDC24 session 10212 and Apple sample code. Sources are listed at the end and cited inline as [S#].

## Question

What is the current best practice for reliable background GPS recording on iOS 17+ for a 1-hour Track with the screen locked, using no more than 10% battery?

## Answer in short

- **Recording API:** `CLLocationUpdate.liveUpdates(.fitness)` together with a held `CLBackgroundActivitySession`. Both are available from iOS 17 [S1][S3]. Plus the `location` background mode.
- **Permission:** **When In Use** only. Do not ask for Always. A `CLBackgroundActivitySession` keeps a When-In-Use app "in use" in the background and shows the blue location indicator [S3][S12]. That indicator also covers PLAN.md's "visible recording indicator" mitigation.
- **Relaunch after termination:** Core Location relaunches the app in the background when updates are ready [S12][S13]. At launch, the app must immediately restart `liveUpdates` and recreate the session object [S4][S5].
- **iOS 18:** no strong reason to require it. `CLServiceSession` and the diagnostic properties are useful but optional, so adopt them behind `if #available(iOS 18, *)`. **Minimum iOS stays 17.**
- **Motion hints:** at Track stop, call `CMMotionActivityManager.queryActivityStarting(from:to:...)` and upload the results with the Track as classification hints [S20][S21].
- **Offline queue:** write each point to an on-disk store (SwiftData or Core Data/SQLite) as soon as it arrives. The store file must use `completeUntilFirstUserAuthentication` protection, not `complete` [S23][S24].
- **Battery:** measure on the device with an untethered Performance Trace in Power Profiler (iOS 26 test device) [S27]. Cross-check with battery-percentage deltas logged in the app and with the Settings > Battery screen.

## 1. `CLLocationUpdate.liveUpdates` vs `CLLocationManager`

| | `CLLocationUpdate.liveUpdates` + `CLBackgroundActivitySession` (iOS 17) | `CLLocationManager` + `allowsBackgroundLocationUpdates` |
|---|---|---|
| Background delivery | Hold a `CLBackgroundActivitySession`, started in the foreground. This lets a When-In-Use app receive updates in the background [S3][S12]. | Set `allowsBackgroundLocationUpdates = true` and start updates in the foreground. The system keeps the app running and shows the indicator [S6]. |
| Stationary pause | Built in. The last update before a pause has `isStationary == true`. When the device moves again, Core Location wakes the app and **resumes on its own** [S2][S12]. | `pausesLocationUpdatesAutomatically` is `true` by default. For a When-In-Use app, a pause **ends location access until the app is launched again** [S8]. So it must be set to `false` for us. |
| Relaunch after termination | Core Location tracks the outstanding `liveUpdates` and session. It relaunches the app in the background when updates are ready. The app must recreate both right away [S12][S13]. | Standard location updates do not relaunch a terminated app. Only significant-change, region and visit services do [S10]. |
| Accuracy and filter control | Only the preset `LiveConfiguration` values: `.default`, `.fitness`, `.otherNavigation`, `.automotiveNavigation`, `.airborne` [S4]. No `desiredAccuracy` or `distanceFilter`. | Full control over `desiredAccuracy`, `distanceFilter` and `activityType` [S7][S9][S11]. |
| Diagnostics | On iOS 17: `location` and `isStationary` only. The `authorizationDenied`, `insufficientlyInUse`, `locationUnavailable` and similar properties need iOS 18 [S2][S15]. | Delegate callbacks and `authorizationStatus`. |

**Recommendation:** use `liveUpdates` with a held `CLBackgroundActivitySession` as the primary recorder. It gives automatic pause and resume while stationary, and Core Location brings the app back after termination. Those two properties are what F1 and N5 need. Apple describes this pairing as the way to get background updates without a Live Activity [S12].

Keep one `CLLocationManager` instance anyway. On iOS 17 it is needed to call `requestWhenInUseAuthorization()`, because implicit authorization from iterating `liveUpdates` only arrived in iOS 18 [S5][S16].

Fall back to `CLLocationManager` only if the M1 field test shows `liveUpdates` uses too much power and we need `desiredAccuracy` tuning. In that case use `allowsBackgroundLocationUpdates = true`, `pausesLocationUpdatesAutomatically = false`, `activityType = .fitness`, `showsBackgroundLocationIndicator = true` and a small `distanceFilter` (5–10 m). Relaunch after termination would then also need significant-change monitoring as a safety net [S6][S8][S10][S11].

A Live Activity (ActivityKit) is the other route Apple names: background updates continue for as long as the Live Activity is active [S12]. It is optional for v1. It would also give the user a lock-screen recording UI.

### Lifecycle rules (from WWDC23 10180 and the SwiftUI article)

- Create the `CLBackgroundActivitySession` **in the foreground**, at Track start. A new session cannot be started from the background, only rejoined [S12].
- Store it in a long-lived property. If the object is deallocated, the session is invalidated and background access ends [S12].
- Persist a "Track in progress" flag, for example in `UserDefaults`, which is what Apple's sample does. In `application(_:didFinishLaunchingWithOptions:)`, if the flag is set, recreate the `CLBackgroundActivitySession` and restart `liveUpdates` **immediately**. A SwiftUI app needs a `UIApplicationDelegateAdaptor` for this [S5][S12].
- Core Location only remembers the outstanding sessions for "a few seconds" after relaunch [S13]. Do not defer this work.
- Do not start location services at launch if authorization is `.notDetermined` [S5].
- At Track stop, call `invalidate()` on the session and break out of the `for try await` loop [S3][S12].

### Choosing a `LiveConfiguration` / `activityType`

- `.fitness` is meant for "dedicated fitness sessions such as walking, running, cycling". It **disables indoor positioning**, and it may pause updates when the user is not moving [S17][S18].
- `.otherNavigation` is meant for "transportation that doesn't, or may not, adhere to roads, such as cycling, scooters, trains, boats" [S19].
- Recommended default: `.fitness`, because most Tracks are Exercise. One stream covers the whole Track, and the server splits it into Segments (N1). Compare `.fitness` with `.otherNavigation` on a mixed walk-and-drive Track in M1. Apple does not document what each preset changes internally.

### Adaptive sampling (N2)

- **Stationary periods:** with `liveUpdates`, Core Location pauses on its own and suspends the app [S2][S12]. Stopping at traffic lights or taking breaks costs little.
- **Distance thinning:** with `liveUpdates`, drop points in the app before writing them, for example when less than about 5 m from the last stored point or when accuracy is above 50 m (F4). Only Core Location's accuracy setting changes how much hardware is used [S7]. App-side thinning saves storage, CPU and upload, not GPS power.
- **Significant-change service:** this is what N2 mentions. It cannot record a Track: it fires about every 500 m and at most every 5 minutes [S10]. Its only use is as the relaunch safety net in the `CLLocationManager` fallback.

## 2. iOS 18 `CLServiceSession`: should we require iOS 18?

**No.** What iOS 18 adds:

- `CLServiceSession` (iOS 18) declares an authorization goal, `.whenInUse` or `.always`, and re-asks for permission when a temporary authorization lapses [S14].
- Diagnostic properties on `CLLocationUpdate` and on the session (iOS 18): `authorizationDenied`, `insufficientlyInUse`, `accuracyLimited`, `locationUnavailable`, `serviceSessionRequired` and others [S2][S15]. They explain why updates stopped. For example, approximate location only updates every 15–20 minutes [S13].
- Implicit sessions: iterating `liveUpdates` on iOS 18 counts as holding a `.whenInUse` session and prompts for permission by itself. `NSLocationRequireExplicitServiceSession` turns this off [S13][S16].
- On iOS 18 and later, **Always** authorization only takes effect while the app holds a `CLServiceSession(.always)`, and that session can only start in the foreground [S13]. This matters only if we ever ask for Always.

None of these is needed for background recording. `CLLocationUpdate` and `CLBackgroundActivitySession` both work on iOS 17 [S1][S3]. Use `if #available(iOS 18, *)` to:

- hold a `CLServiceSession(authorization: .whenInUse)` for the length of a Track;
- show UI when the diagnostics report denial, reduced accuracy (`accuracyLimited`) or no location.

One minor cost: Apple's current sample projects ("Adopting live updates in Core Location", "Monitoring location changes") require iOS 18 and Xcode 16 [S25][S26]. We can still read them; we just guard the iOS 18 calls.

## 3. Info.plist, capabilities and permission flow

### Required

- **Signing & Capabilities > Background Modes > Location updates.** This adds `UIBackgroundModes` = `location` [S5][S22]. Without it, setting `allowsBackgroundLocationUpdates = true` is a fatal error [S6], and `CLBackgroundActivitySession` does not work [S12].
- `NSLocationWhenInUseUsageDescription`. Its text must clearly explain background use (N3). For example: "Conquer the World records your route while a Track is running, including when the screen is locked, so it can claim the Lands you loop around. Your route is never shown to other players."
- `NSMotionUsageDescription`, if we use CoreMotion hints. Without it the app crashes when it calls the API [S20][S28].

### Not needed

- `NSLocationAlwaysAndWhenInUseUsageDescription` is only required if the app asks for Always [S29].
- `UIRequiredDeviceCapabilities` `gps` is optional. Apple says to add it only if the app cannot work without high-precision location [S16].

### Permission flow (recommended)

1. On the first tap of **Start Track**, call `requestWhenInUseAuthorization()`. Do not ask at app launch: Apple advises asking where the feature is used [S16].
2. Once authorized, create the `CLBackgroundActivitySession` and start `liveUpdates`, both in the foreground [S12].
3. Lock the screen. The blue pill or bar indicator appears, and recording continues [S6][S12].
4. **Do not escalate to Always.** For a Track the user starts themselves, Always adds nothing. It also asks for more than N3's privacy stance needs, and on iOS 18+ it would require holding a `.always` session anyway [S13]. Apple's own rule is to request Always only after When In Use, and the system limits how many times the app can ask [S30].
5. **Precise location off:** if the user grants only approximate location, updates arrive every 15–20 minutes [S13]. Claiming cannot work like that. Detect it (`accuracyAuthorization`, or `accuracyLimited` on iOS 18) and ask the user to turn Precise Location on. The temporary full-accuracy request with a purpose key is also an option.
6. **Allow Once:** this grants a temporary When In Use authorization that lapses "when your app is no longer in use" [S30]. Test in M1 whether a `CLBackgroundActivitySession` keeps an Allow Once grant alive through a locked-screen hour. See Risks.

## 4. CoreMotion activity as classification hints (F3)

- `CMMotionActivityManager` reports walking, running, cycling, automotive, stationary and unknown, each with a confidence value. More than one flag can be true at once, for example automotive and stationary at a red light [S20][S21].
- **Live updates are not delivered while the app is suspended.** Only the last one arrives on resume [S31]. Background recording with `liveUpdates` suspends the app during stationary pauses [S12], so live updates would have gaps.
- **Recommended:** at Track stop, call `queryActivityStarting(from: trackStart, to: trackEnd, ...)`. It returns the device's recorded history; the system keeps up to 7 days of it, and results may lag by up to a few minutes [S32]. Upload the activity intervals and confidences with the Track. The server classifier uses them as hints (N1). Because the query has a delay, it is safer to repeat it at upload time than to rely on the single call at Track stop.

## 5. On-device persistence for the offline queue (F2, N5)

- Append each accepted point to an on-disk store **as it arrives**, one transaction per point or per small batch. Never hold a Track only in memory, because the app can be terminated at any time [S5].
- Storage: SwiftData (iOS 17+) or Core Data/SQLite are all fine [S33]. The schema is small: `Track(id, startedAt, endedAt, state)` and `Point(trackId, t, lat, lon, hAcc, vAcc, alt, speed, course)`, plus `MotionHint` rows and an upload cursor.
- **File protection:** writes happen while the screen is locked, so the store must use `FileProtectionType.completeUntilFirstUserAuthentication`. With `complete`, the file "cannot be read from or written to while the device is locked" [S23][S24]. This class still encrypts data at rest, which meets Apple's "encrypt location data you store" advice [S16].
- **Upload:** send batches from the queue with an idempotent batch or point key. Do this while the app is awake and has network, and finish off at Track stop. Background `URLSession` transfers continue while the app is suspended or terminated by the system, but they are cancelled if the user force-quits [S34]. The store stays the source of truth until the server acknowledges a batch.

## 6. Measuring battery use for a 1-hour Track (N2, M1 "done when")

Primary method: **Power Profiler Performance Trace on the device** [S27].

- Requires a test iPhone on iOS 26 or later with Developer Mode on. Go to Settings > Developer > Performance Trace, choose Power Profiler mode, and turn tracing on for our app. Start and stop it from a Control Center control. It records up to 10 hours, with no Xcode tether.
- The trace shows total system power as a fraction of battery energy per hour, plus our app's power broken down by CPU, GPU, display and networking. It also records charging state, thermal state and display brightness.
- Run it untethered. "Xcode keeps Apple silicon awake while it's paired", and a charging device reports 0 [S27].
- Power impact values cannot be compared across device models [S27]. Use the same test device every time.

Protocol:

1. Use the same recent iPhone, not charging, cellular on and Wi-Fi as usual.
2. Run a 1-hour outdoor walk with the screen locked the whole time and the app recording with `.fitness`.
3. Run a control of 1 hour with the phone idle and locked, and no Track.
4. Do at least 3 runs of each.

Pass if the Track minus the control is 10% of battery or less. Per Power Profiler, that is a system rate of about 0.10 battery per hour or below.

Cross-checks:

- The app logs `UIDevice.current.batteryLevel` at Track start and stop. It returns 0.0–1.0, or −1 if `isBatteryMonitoringEnabled` is false [S35]. Store this in the Track metadata so beta users' Tracks become a free data set.
- Settings > Battery, per-app usage for the last 24 hours.
- Later (M7 and TestFlight): Xcode Organizer Battery Usage, which breaks out a Location category, and MetricKit `MXLocationActivityMetric` from real users [S36][S37].

The Xcode Energy Impact gauge is fine for quick checks but needs a tethered device, so it does not measure the real locked-screen case [S36].

## 7. Sketch (iOS 17 baseline, iOS 18 additions guarded)

```swift
@MainActor final class Recorder {
    static let shared = Recorder()
    private let manager = CLLocationManager()          // used for authorization on iOS 17
    private var background: CLBackgroundActivitySession?
    private var serviceSession: AnyObject?              // CLServiceSession on iOS 18+
    private var task: Task<Void, Never>?
    private var trackStart = Date()
    var trackInProgress: Bool {                          // survives termination
        get { UserDefaults.standard.bool(forKey: "trackInProgress") }
        set { UserDefaults.standard.set(newValue, forKey: "trackInProgress") }
    }

    func start() {                                       // called from the foreground
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
        trackInProgress = true
        trackStart = .now                                // persist with the Track row in practice
        resume()
    }

    func resume() {                                      // also called from didFinishLaunching
        background = CLBackgroundActivitySession()
        if #available(iOS 18, *) { serviceSession = CLServiceSession(authorization: .whenInUse) }
        task = Task {
            do {
                for try await update in CLLocationUpdate.liveUpdates(.fitness) {
                    if let loc = update.location { PointStore.append(loc) }   // persist immediately
                    // iOS 18: inspect update.accuracyLimited / .locationUnavailable / .authorizationDenied
                }
            } catch { /* log */ }
        }
    }

    func stop() {
        task?.cancel(); background?.invalidate(); background = nil; serviceSession = nil
        trackInProgress = false
        MotionHints.query(from: trackStart, to: .now)    // CMMotionActivityManager history
    }
}
// AppDelegate.application(_:didFinishLaunchingWithOptions:): if trackInProgress { Recorder.shared.resume() }
```

## Open risks (verify in the M1 field test)

1. **Force-quit.** WWDC23 says Core Location can recover a terminated app "in most cases" and lists "user close" among the ways an app ends up terminated [S12]. It does not promise a relaunch after the user swipes the app away. Background `URLSession` is explicitly cancelled on force-quit [S34]. Test this. If there is no relaunch, show a "Track still recording, reopen the app" notification, or make the stop state easy to recover.
2. **Allow Once plus a background session over an hour.** This is not documented. Test it. If the grant lapses, ask the user for "While Using".
3. **`.fitness` vs `.otherNavigation` for mixed Tracks.** `.fitness` turns off indoor positioning and may pause during slow or stopped driving [S17]. Compare on fixture Tracks.
4. **No accuracy knob with `liveUpdates`.** If one hour goes over 10%, the only lever is to switch to `CLLocationManager` with a lower `desiredAccuracy`. That costs Claim precision (N6) and loses relaunch.
5. **`isStationary` false positives.** Very slow walking or standing in a queue may trigger a pause. Resume should be automatic [S12], but check for gaps that could break Loops (F6).
6. **Battery threshold.** Apple publishes no figure for GPS power per hour, so the 10% target can only be checked by measurement.
7. **Power Profiler needs iOS 26 on the test device.** Use the `batteryLevel` deltas if no iOS 26 device is available.

## Sources

All Apple developer documentation was read through its JSON data endpoint (`developer.apple.com/tutorials/data/documentation/...`). Page URLs are below.

- [S1] CLLocationUpdate (iOS 17.0): https://developer.apple.com/documentation/corelocation/cllocationupdate
- [S2] CLLocationUpdate `isStationary`, `stationary`, `insufficientlyInUse`, `authorizationDenied`, `serviceSessionRequired` (diagnostics are iOS 18.0): https://developer.apple.com/documentation/corelocation/cllocationupdate/isstationary
- [S3] CLBackgroundActivitySession (iOS 17.0): https://developer.apple.com/documentation/corelocation/clbackgroundactivitysession-3mzv3
- [S4] CLLocationUpdate.LiveConfiguration and liveUpdates(_:): https://developer.apple.com/documentation/corelocation/cllocationupdate/liveconfiguration
- [S5] Handling location updates in the background: https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background ; Supporting live updates in SwiftUI and Mac Catalyst apps: https://developer.apple.com/documentation/corelocation/supporting-live-updates-in-swiftui-and-mac-catalyst-apps
- [S6] allowsBackgroundLocationUpdates: https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates
- [S7] desiredAccuracy: https://developer.apple.com/documentation/corelocation/cllocationmanager/desiredaccuracy
- [S8] pausesLocationUpdatesAutomatically: https://developer.apple.com/documentation/corelocation/cllocationmanager/pauseslocationupdatesautomatically
- [S9] distanceFilter: https://developer.apple.com/documentation/corelocation/cllocationmanager/distancefilter
- [S10] startMonitoringSignificantLocationChanges(): https://developer.apple.com/documentation/corelocation/cllocationmanager/startmonitoringsignificantlocationchanges()
- [S11] activityType, showsBackgroundLocationIndicator: https://developer.apple.com/documentation/corelocation/cllocationmanager/activitytype , https://developer.apple.com/documentation/corelocation/cllocationmanager/showsbackgroundlocationindicator
- [S12] WWDC23 10180 "Discover streamlined location updates" (transcript): https://developer.apple.com/videos/play/wwdc2023/10180/
- [S13] WWDC24 10212 "What's new in location authorization" (transcript): https://developer.apple.com/videos/play/wwdc2024/10212/
- [S14] CLServiceSession (iOS 18.0): https://developer.apple.com/documentation/corelocation/clservicesession-pt7n
- [S15] CLServiceSessionDiagnostic / CLBackgroundActivitySessionDiagnostic (iOS 18.0): https://developer.apple.com/documentation/corelocation/clservicesessiondiagnostic
- [S16] Configuring your app to use location services: https://developer.apple.com/documentation/corelocation/configuring-your-app-to-use-location-services ; Core Location updates (June 2024): https://developer.apple.com/documentation/updates/corelocation
- [S17] CLActivityType.fitness: https://developer.apple.com/documentation/corelocation/clactivitytype/fitness
- [S18] LiveConfiguration.fitness: https://developer.apple.com/documentation/corelocation/cllocationupdate/liveconfiguration/fitness
- [S19] LiveConfiguration.otherNavigation: https://developer.apple.com/documentation/corelocation/cllocationupdate/liveconfiguration/othernavigation
- [S20] CMMotionActivityManager: https://developer.apple.com/documentation/coremotion/cmmotionactivitymanager
- [S21] CMMotionActivity: https://developer.apple.com/documentation/coremotion/cmmotionactivity
- [S22] UIBackgroundModes: https://developer.apple.com/documentation/bundleresources/information-property-list/uibackgroundmodes
- [S23] FileProtectionType.completeUntilFirstUserAuthentication: https://developer.apple.com/documentation/foundation/fileprotectiontype/completeuntilfirstuserauthentication
- [S24] FileProtectionType.complete: https://developer.apple.com/documentation/foundation/fileprotectiontype/complete
- [S25] Sample: Adopting live updates in Core Location (iOS 18, Xcode 16): https://developer.apple.com/documentation/corelocation/adopting-live-updates-in-core-location
- [S26] Sample: Monitoring location changes with Core Location: https://developer.apple.com/documentation/corelocation/monitoring-location-changes-with-core-location
- [S27] Measuring your app's power use with Power Profiler: https://developer.apple.com/documentation/xcode/measuring-your-app-s-power-use-with-power-profiler
- [S28] NSMotionUsageDescription: https://developer.apple.com/documentation/bundleresources/information-property-list/nsmotionusagedescription
- [S29] NSLocationAlwaysAndWhenInUseUsageDescription: https://developer.apple.com/documentation/bundleresources/information-property-list/nslocationalwaysandwheninuseusagedescription
- [S30] requestAlwaysAuthorization(): https://developer.apple.com/documentation/corelocation/cllocationmanager/requestalwaysauthorization()
- [S31] startActivityUpdates(to:withHandler:): https://developer.apple.com/documentation/coremotion/cmmotionactivitymanager/startactivityupdates(to:withhandler:)
- [S32] queryActivityStarting(from:to:to:withHandler:): https://developer.apple.com/documentation/coremotion/cmmotionactivitymanager/queryactivitystarting(from:to:to:withhandler:)
- [S33] SwiftData (iOS 17.0): https://developer.apple.com/documentation/swiftdata
- [S34] URLSessionConfiguration.background(withIdentifier:): https://developer.apple.com/documentation/foundation/urlsessionconfiguration/background(withidentifier:)
- [S35] UIDevice.batteryLevel: https://developer.apple.com/documentation/uikit/uidevice/batterylevel
- [S36] Analyzing your app's battery use: https://developer.apple.com/documentation/xcode/analyzing-your-app-s-battery-use
- [S37] MXLocationActivityMetric: https://developer.apple.com/documentation/metrickit/mxlocationactivitymetric
