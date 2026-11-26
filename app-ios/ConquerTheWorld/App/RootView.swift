import CoreLocation
import SwiftUI

struct RootView: View {
    @Environment(TrackRecorder.self) private var recorder
    @State private var serverStatus = "Checking server…"

    var body: some View {
        ZStack(alignment: .bottom) {
            LandMapView(showsUserLocation: recorder.canShowLocation)
                .ignoresSafeArea()

            VStack(spacing: 8) {
                if recorder.accuracyReduced {
                    Label("Turn on Precise Location for this app, or Tracks will be too sparse to claim Lands.",
                          systemImage: "location.slash")
                        .font(.footnote)
                }
                if recorder.authorizationDenied {
                    Label("Location access is off. Enable it in Settings to record Tracks.",
                          systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                }
                recordButton
                Text(status)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(serverStatus)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding()
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            .padding()
        }
        .task { serverStatus = await APIClient.healthSummary() }
    }

    private var recordButton: some View {
        Button {
            if recorder.isRecording {
                Task { await recorder.stop() }
            } else {
                recorder.start()
            }
        } label: {
            Label(recorder.isRecording ? "Stop Track" : "Start Track",
                  systemImage: recorder.isRecording ? "stop.circle.fill" : "record.circle")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(recorder.isRecording ? .red : .accentColor)
    }

    private var status: String {
        guard recorder.isRecording else { return "Not recording" }
        let still = recorder.isStationary ? " · paused while still" : ""
        return "\(recorder.pointCount) points recorded\(still)"
    }
}
