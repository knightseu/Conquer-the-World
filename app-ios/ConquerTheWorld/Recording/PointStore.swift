import Foundation

/// Disk-backed offline queue of Track points (F2, N5). Recording never depends on
/// the network: every fix is appended to `<track>.jsonl` as it arrives, and a Track
/// becomes uploadable when `<track>.done.json` is written at stop.
///
/// Files use `completeUntilFirstUserAuthentication`, because `complete` protection
/// would block writes while the screen is locked.
final class PointStore: @unchecked Sendable {
    static let shared: PointStore = {
        do {
            return try PointStore(root: PointStore.defaultRoot())
        } catch {
            fatalError("Cannot create the Track store: \(error)")
        }
    }()

    static func defaultRoot() throws -> URL {
        try FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("Tracks", isDirectory: true)
    }

    let root: URL
    private let fm = FileManager.default
    private let lock = NSLock()
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(root: URL) throws {
        self.root = root
        try fm.createDirectory(at: root, withIntermediateDirectories: true, attributes: Self.protection)
    }

    private static let protection: [FileAttributeKey: Any] = [
        .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication,
    ]

    private func pointsURL(_ id: UUID) -> URL { root.appendingPathComponent("\(id.uuidString).jsonl") }
    private func doneURL(_ id: UUID) -> URL { root.appendingPathComponent("\(id.uuidString).done.json") }

    func append(_ point: RecordedPoint, to id: UUID) throws {
        var line = try encoder.encode(point)
        line.append(0x0A)
        lock.lock()
        defer { lock.unlock() }
        let url = pointsURL(id)
        if !fm.fileExists(atPath: url.path) {
            guard fm.createFile(atPath: url.path, contents: nil, attributes: Self.protection) else {
                throw CocoaError(.fileWriteUnknown, userInfo: [NSFilePathErrorKey: url.path])
            }
        }
        let handle = try FileHandle(forWritingTo: url)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: line)
    }

    /// All points of a Track, in recording order. A torn last line (crash mid-write) is skipped.
    func points(of id: UUID) throws -> [RecordedPoint] {
        lock.lock()
        defer { lock.unlock() }
        guard let data = fm.contents(atPath: pointsURL(id).path) else { return [] }
        return data.split(separator: 0x0A).compactMap { try? decoder.decode(RecordedPoint.self, from: Data($0)) }
    }

    func finish(_ track: FinishedTrack) throws {
        let data = try encoder.encode(track)
        lock.lock()
        defer { lock.unlock() }
        try data.write(to: doneURL(track.id), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    /// Tracks that stopped and wait for upload, oldest first.
    func finishedTracks() throws -> [FinishedTrack] {
        lock.lock()
        defer { lock.unlock() }
        return try fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasSuffix(".done.json") }
            .compactMap { url in fm.contents(atPath: url.path).flatMap { try? decoder.decode(FinishedTrack.self, from: $0) } }
            .sorted { $0.startedAt < $1.startedAt }
    }

    /// Delete a Track after the server has acknowledged it.
    func remove(_ id: UUID) throws {
        lock.lock()
        defer { lock.unlock() }
        for url in [pointsURL(id), doneURL(id)] where fm.fileExists(atPath: url.path) {
            try fm.removeItem(at: url)
        }
    }
}
