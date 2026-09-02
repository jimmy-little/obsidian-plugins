import FlyingFox
import Foundation

final class BridgeServer: @unchecked Sendable {
	static let shared = BridgeServer()
	static let port: UInt16 = 9247

	private let bridge = EventKitBridge()
	private let omnifocus = OmniFocusBridge()
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
		serverTask?.cancel()
		serverTask = nil
		lastError = nil
		serverTask = Task {
			// Let the previous FlyingFox listener release the port.
			try? await Task.sleep(nanoseconds: 600_000_000)
			await self.runServer()
		}
	}

	private func runServer() async {
		do {
			guard !Task.isCancelled else { return }
			let handlers = HTTPHandlers(bridge: bridge, omnifocus: omnifocus)
			let server = HTTPServer(port: Self.port) { request in
				do {
					return try await handlers.route(request)
				} catch {
					let msg = (error as NSError).localizedDescription
					let body = (msg.isEmpty ? "Internal server error" : msg).data(using: .utf8)!
					return HTTPResponse(statusCode: .internalServerError, body: body)
				}
			}
			// Bind first so LaunchAgent health checks succeed; permissions can prompt afterward.
			Task { @MainActor in
				let auth = self.bridge.authorizationStatus()
				let needReminders = !(auth["reminders"] == "fullAccess" || auth["reminders"] == "authorized")
				let needCalendar = !(auth["calendar"] == "fullAccess" || auth["calendar"] == "authorized")
				if needReminders || needCalendar {
					try? await self.bridge.requestAccess()
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
					"Fulcrum Bridge: port \(Self.port) already in use — retrying…\n",
					stderr,
				)
				guard !Task.isCancelled else { return }
				try? await Task.sleep(nanoseconds: 800_000_000)
				guard !Task.isCancelled else { return }
				await runServer()
				return
			}
			fputs("Fulcrum Bridge: server error — \(error)\n", stderr)
		}
	}
}
