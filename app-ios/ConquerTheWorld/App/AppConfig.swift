import Foundation
import Sentry

enum AppConfig {
    /// From the `API_BASE_URL` build setting (Info.plist `APIBaseURL`).
    static var apiBaseURL: URL {
        let raw = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String ?? ""
        return URL(string: raw) ?? URL(string: "http://localhost:3000")!
    }

    /// OpenFreeMap basemap (ADR 0005). Swapping providers only changes this URL.
    static let basemapStyleURL = URL(string: "https://tiles.openfreemap.org/styles/liberty")!

    static func startCrashReporting() {
        guard let dsn = Bundle.main.object(forInfoDictionaryKey: "SentryDSN") as? String, !dsn.isEmpty else {
            return
        }
        SentrySDK.start { options in
            options.dsn = dsn
            options.tracesSampleRate = 0
        }
    }
}
