import CoreLocation
import Foundation
import Observation

/// Records a Track in the background with the screen locked (F1), following
/// "iOS background location on iOS 17+":
/// - `CLLocationUpdate.liveUpdates(.fitness)` plus a held `CLBackgroundActivitySession`;
/// - When In Use permission only, requested at the first Start Track, never Always;
/// - a persisted "Track in progress" flag, so a relaunch in the background resumes
///   the session at once from `didFinishLaunching`.
@MainActor
@Observable
final class TrackRecorder {
    private(set) var trackID: UUID?
    private(set) var pointCount = 0
    private(set) var isStationary = false
    private(set) var lastLocation: CLLocation?
    private(set) var authorization: CLAuthorizationStatus
    private(set) var accuracyReduced = false
    private(set) var lastError: String?

    var isRecording: Bool { trackID != nil }
    var authorizationDenied: Bool { authorization == .denied || authorization == .restricted }
    var canShowLocation: Bool { authorization == .authorizedWhenInUse || authorization == .authorizedAlways }

    @ObservationIgnored private let store: PointStore
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let manager = CLLocationManager()
    @ObservationIgnored private let authDelegate = AuthorizationDelegate()
    @ObservationIgnored private var backgroundSession: CLBackgroundActivitySession?
    @ObservationIgnored private var updatesTask: Task<Void, Never>?

    private static let inProgressKey = "track.inProgress.id"
    private static let startedAtKey = "track.inProgress.startedAt"

    init(store: PointStore = .shared, defaults: UserDefaults = .standard) {
        self.store = store
        self.defaults = defaults
        authorization = manager.authorizationStatus
        manager.delegate = authDelegate
        authDelegate.onChange = { [weak self] status, reduced in
            Task { @MainActor in
                self?.authorization = status
                self?.accuracyReduced = reduced
            }
        }
    }

    func start() {
        guard !isRecording else { return }
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        let id = UUID()
        defaults.set(id.uuidString, forKey: Self.inProgressKey)
        defaults.set(Date().timeIntervalSince1970, forKey: Self.startedAtKey)
        begin(id)
    }

    /// Called from `didFinishLaunching`: resume a Track the system relaunched us for.
    func resumeIfNeeded() {
        guard !isRecording,
              let raw = defaults.string(forKey: Self.inProgressKey),
              let id = UUID(uuidString: raw) else { return }
        begin(id)
    }

    func stop() async {
        guard let id = trackID else { return }
        updatesTask?.cancel()
        updatesTask = nil
        backgroundSession?.invalidate()
        backgroundSession = nil
        trackID = nil

        let startedAt = Date(timeIntervalSince1970: defaults.double(forKey: Self.startedAtKey))
        let stoppedAt = Date()
        defaults.removeObject(forKey: Self.inProgressKey)
        defaults.removeObject(forKey: Self.startedAtKey)

        let motion = await MotionHints.query(from: startedAt, to: stoppedAt)
        do {
            try store.finish(FinishedTrack(
                id: id,
                startedAt: Int64(startedAt.timeIntervalSince1970 * 1000),
                stoppedAt: Int64(stoppedAt.timeIntervalSince1970 * 1000),
                motion: motion
            ))
        } catch {
            lastError = "Could not save the Track: \(error.localizedDescription)"
        }
    }

    private func begin(_ id: UUID) {
        trackID = id
        pointCount = (try? store.points(of: id).count) ?? 0
        // Must be created while the app is in use (foreground, or right after a
        // background relaunch) and held for the whole Track.
        backgroundSession = CLBackgroundActivitySession()
        updatesTask = Task { [weak self] in
            do {
                for try await update in CLLocationUpdate.liveUpdates(.fitness) {
                    guard let self, !Task.isCancelled else { return }
                    self.handle(update, trackID: id)
                }
            } catch {
                self?.lastError = "Location updates stopped: \(error.localizedDescription)"
            }
        }
    }

    private func handle(_ update: CLLocationUpdate, trackID id: UUID) {
        if #available(iOS 18, *) {
            isStationary = update.stationary
        } else {
            isStationary = update.isStationary
        }
        guard let location = update.location else { return }
        lastLocation = location
        do {
            try store.append(RecordedPoint(location), to: id)
            pointCount += 1
        } catch {
            lastError = "Could not store a point: \(error.localizedDescription)"
        }
    }
}

/// Bridges CLLocationManager's delegate callbacks for permission changes.
private final class AuthorizationDelegate: NSObject, CLLocationManagerDelegate, @unchecked Sendable {
    var onChange: ((CLAuthorizationStatus, Bool) -> Void)?

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        onChange?(manager.authorizationStatus, manager.accuracyAuthorization == .reducedAccuracy)
    }
}
