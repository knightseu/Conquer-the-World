import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

/// Thin wrapper over the client generated from `api/openapi.yaml`.
enum APIClient {
    static func make(serverURL: URL = AppConfig.apiBaseURL) -> Client {
        Client(serverURL: serverURL, transport: URLSessionTransport())
    }

    /// One-line server status for the M0 "app and API talk to each other" check.
    static func healthSummary(client: Client = make()) async -> String {
        do {
            switch try await client.getHealth() {
            case let .ok(response):
                let health = try response.body.json
                return "Server \(health.status.rawValue) (\(health.version))"
            case let .serviceUnavailable(response):
                let health = try response.body.json
                return "Server degraded: database \(health.database.rawValue)"
            case let .undocumented(statusCode, _):
                return "Server returned \(statusCode)"
            }
        } catch {
            return "Server unreachable"
        }
    }
}
