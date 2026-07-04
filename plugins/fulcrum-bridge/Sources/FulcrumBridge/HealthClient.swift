import Foundation

struct HealthResponse: Codable {
	let ok: Bool
	let status: String
	let authorization: [String: String]
	let calendarCount: Int
}

enum HealthClient {
	static func fetchSummary() async -> String {
		guard let url = URL(string: "http://127.0.0.1:\(BridgeServer.port)/health") else {
			return "Invalid health URL."
		}
		do {
			let (data, response) = try await URLSession.shared.data(from: url)
			guard let http = response as? HTTPURLResponse else {
				return "Unexpected response from bridge."
			}
			guard http.statusCode == 200 else {
				return "HTTP \(http.statusCode) from bridge."
			}
			let health = try JSONDecoder().decode(HealthResponse.self, from: data)
			let rem = health.authorization["reminders"] ?? "?"
			let cal = health.authorization["calendar"] ?? "?"
			return """
			Status: \(health.status) (\(health.ok ? "healthy" : "needs attention"))
			Calendars visible: \(health.calendarCount)
			Reminders access: \(rem)
			Calendar access: \(cal)
			URL: http://127.0.0.1:\(BridgeServer.port)/health
			"""
		} catch {
			if let err = BridgeServer.shared.lastError, !err.isEmpty {
				return "Bridge not responding.\n\nLast server error:\n\(err)"
			}
			return "Bridge not responding on port \(BridgeServer.port).\n\n\(error.localizedDescription)"
		}
	}
}
