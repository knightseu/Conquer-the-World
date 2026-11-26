import CoreMotion
import Foundation

/// Live motion updates do not arrive while the app is suspended, so query the
/// activity history for the whole Track window at stop time instead.
enum MotionHints {
    static func query(from start: Date, to end: Date) async -> [MotionHint] {
        guard CMMotionActivityManager.isActivityAvailable() else { return [] }
        let manager = CMMotionActivityManager()
        let activities: [CMMotionActivity] = await withCheckedContinuation { continuation in
            manager.queryActivityStarting(from: start, to: end, to: .main) { activities, _ in
                continuation.resume(returning: activities ?? [])
            }
        }
        return activities.map { activity in
            MotionHint(
                start: Int64((activity.startDate.timeIntervalSince1970 * 1000).rounded()),
                kind: kind(of: activity),
                confidence: activity.confidence.rawValue
            )
        }
    }

    private static func kind(of a: CMMotionActivity) -> MotionHint.Kind {
        if a.automotive { return .automotive }
        if a.cycling { return .cycling }
        if a.running { return .running }
        if a.walking { return .walking }
        if a.stationary { return .stationary }
        return .unknown
    }
}
