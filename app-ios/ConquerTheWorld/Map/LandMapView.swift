import MapLibre
import SwiftUI

/// MapLibre map in SwiftUI (ADR 0005). Lands will arrive as vector tiles from the
/// server per Clan and category once the tile endpoint exists; for now it shows the
/// OpenFreeMap basemap and the user's location.
struct LandMapView: UIViewRepresentable {
    /// Only show the location puck once permission is granted, so the map never
    /// triggers the permission prompt itself (that belongs to the first Start Track).
    var showsUserLocation: Bool

    func makeUIView(context: Context) -> MLNMapView {
        let map = MLNMapView(frame: .zero, styleURL: AppConfig.basemapStyleURL)
        map.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        map.zoomLevel = 14
        return map
    }

    func updateUIView(_ map: MLNMapView, context: Context) {
        guard map.showsUserLocation != showsUserLocation else { return }
        map.showsUserLocation = showsUserLocation
        if showsUserLocation { map.userTrackingMode = .follow }
    }
}
