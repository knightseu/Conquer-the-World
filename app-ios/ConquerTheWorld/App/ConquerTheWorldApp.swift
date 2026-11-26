import SwiftUI
import UIKit

@main
struct ConquerTheWorldApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appDelegate.recorder)
        }
    }
}

/// Owns the recorder so it exists before any scene does: when iOS relaunches the app
/// in the background for location updates, there is no UI, and Core Location only
/// remembers the old sessions for a few seconds after launch.
final class AppDelegate: NSObject, UIApplicationDelegate {
    let recorder = TrackRecorder()

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        AppConfig.startCrashReporting()
        recorder.resumeIfNeeded()
        return true
    }
}
