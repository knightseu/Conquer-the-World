import CoreLocation
import Foundation

/// One GPS fix as stored on disk and uploaded. Field names and units match the
/// server's `TrackPoint` (ms epoch, degrees, metres).
struct RecordedPoint: Codable, Equatable, Sendable {
    var t: Int64
    var lat: Double
    var lon: Double
    /// Horizontal accuracy in metres.
    var acc: Double
    /// Altitude in metres, only when the fix has a valid vertical accuracy.
    var alt: Double?

    init(t: Int64, lat: Double, lon: Double, acc: Double, alt: Double? = nil) {
        self.t = t
        self.lat = lat
        self.lon = lon
        self.acc = acc
        self.alt = alt
    }

    init(_ location: CLLocation) {
        self.init(
            t: Int64((location.timestamp.timeIntervalSince1970 * 1000).rounded()),
            lat: location.coordinate.latitude,
            lon: location.coordinate.longitude,
            acc: location.horizontalAccuracy,
            alt: location.verticalAccuracy > 0 ? location.altitude : nil
        )
    }
}

/// A Core Motion activity interval, sent to the server as a classification hint (F3).
struct MotionHint: Codable, Equatable, Sendable {
    enum Kind: String, Codable, Sendable { case stationary, walking, running, cycling, automotive, unknown }
    var start: Int64
    var kind: Kind
    /// 0 = low, 1 = medium, 2 = high (CMMotionActivityConfidence).
    var confidence: Int
}

/// Metadata written when a Track stops; its presence marks the Track ready to upload.
struct FinishedTrack: Codable, Equatable, Sendable {
    var id: UUID
    var startedAt: Int64
    var stoppedAt: Int64
    var motion: [MotionHint]
}
