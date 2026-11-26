@testable import ConquerTheWorld
import XCTest

final class PointStoreTests: XCTestCase {
    private var root: URL!
    private var store: PointStore!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        store = try PointStore(root: root)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    func testAppendsAndReadsBackInOrder() throws {
        let id = UUID()
        let points = (0 ..< 3).map { RecordedPoint(t: 1_000 + Int64($0), lat: 47.6, lon: -122.3, acc: 5) }
        for p in points { try store.append(p, to: id) }
        XCTAssertEqual(try store.points(of: id), points)
    }

    func testSkipsATornLastLine() throws {
        let id = UUID()
        try store.append(RecordedPoint(t: 1, lat: 1, lon: 1, acc: 5), to: id)
        let url = root.appendingPathComponent("\(id.uuidString).jsonl")
        let handle = try FileHandle(forWritingTo: url)
        try handle.seekToEnd()
        try handle.write(contentsOf: Data("{\"t\":2,\"la".utf8))
        try handle.close()
        XCTAssertEqual(try store.points(of: id).count, 1)
    }

    func testFinishedTracksAreListedThenRemoved() throws {
        let a = FinishedTrack(id: UUID(), startedAt: 2, stoppedAt: 3, motion: [])
        let b = FinishedTrack(id: UUID(), startedAt: 1, stoppedAt: 2, motion: [MotionHint(start: 1, kind: .walking, confidence: 2)])
        try store.append(RecordedPoint(t: 1, lat: 1, lon: 1, acc: 5), to: a.id)
        try store.finish(a)
        try store.finish(b)
        XCTAssertEqual(try store.finishedTracks(), [b, a])
        try store.remove(a.id)
        XCTAssertEqual(try store.finishedTracks(), [b])
        XCTAssertEqual(try store.points(of: a.id), [])
    }
}
