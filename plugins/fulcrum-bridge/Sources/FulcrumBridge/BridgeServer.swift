import FlyingFox
import Foundation

final class BridgeServer: @unchecked Sendable {
	static let shared = BridgeServer()
	static let port: UInt16 = 9247

	private let bridge = EventKitBridge()
	private var serverTask: Task<Void, Never>?
	private(set) var lastError: String?

	private init() {}

	var isRunning: Bool {
		serverTask != nil && !(serverTask?.isCancelled ?? true)
	}

	func start() {
		serverTask?.cancel()
		lastError = nil
		serverTask = Task { await self.runServer() }
	}

	func stop() {
		serverTask?.cancel()
		serverTask = nil
	}

	func restart() {
		stop()
		serverTask = Task {
			try? await Task.sleep(nanoseconds: 400_000_000)
			await self.runServer()
		}
	}

	private func runServer() async {
		do {
			try await bridge.requestAccess()
			let handlers = HTTPHandlers(bridge: bridge)
			let server = HTTPServer(port: Self.port) { request in
				do {
					return try await handlers.route(request)
				} catch {
					let msg = (error as NSError).localizedDescription
					return HTTPResponse(statusCode: .internalServerError, body: msg.data(using: .utf8)!)
				}
			}
			fputs("Fulcrum Bridge listening on http://127.0.0.1:\(Self.port)\n", stderr)
			try await server.run()
		} catch is CancellationError {
			return
		} catch {
			let msg = String(describing: error)
			lastError = msg
			if msg.contains("Address already in use") || msg.contains("errno: 48") {
				fputs(
					"Fulcrum Bridge: port \(Self.port) already in use — another copy may be running.\n",
					stderr,
				)
			} else {
				fputs("Fulcrum Bridge: server error — \(error)\n", stderr)
			}
		}
	}
}
