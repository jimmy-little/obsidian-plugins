import FlyingFox
import Foundation

struct HTTPHandlers {
	let bridge: EventKitBridge

	func route(_ request: HTTPRequest) async throws -> HTTPResponse {
		let path = request.path
		let method = request.method.rawValue

		if path == "/health" && method == "GET" {
			let auth = bridge.authorizationStatus()
			let ok = (auth["reminders"] == "fullAccess" || auth["reminders"] == "authorized")
				&& (auth["calendar"] == "fullAccess" || auth["calendar"] == "authorized")
			return jsonResponse(
				HealthResponse(
					ok: ok,
					status: ok ? "ok" : "needs_permission",
					authorization: auth,
					calendarCount: bridge.calendars().count
				)
			)
		}

		if path == "/lists" && method == "GET" {
			return jsonResponse(["lists": bridge.lists()])
		}

		if path == "/lists" && method == "POST" {
			let body = try await readJsonBody(request)
			let name = (body["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
			guard !name.isEmpty else {
				return HTTPResponse(statusCode: .badRequest, body: "Missing list name".data(using: .utf8)!)
			}
			let listId = try bridge.createList(name: name)
			return jsonResponse(["listId": listId, "id": listId])
		}

		if path == "/reminders" && method == "GET" {
			return jsonResponse(["reminders": bridge.reminders()])
		}

		if path == "/reminders" && method == "POST" {
			let body = try await readJsonBody(request)
			let id = try bridge.createReminder(body: body)
			return jsonResponse(["numericId": id, "id": id])
		}

		if path == "/calendars" && method == "GET" {
			return jsonResponse(["calendars": bridge.calendars()])
		}

		if path == "/events" && method == "GET" {
			let fromStr = request.query["from"] ?? ""
			let toStr = request.query["to"] ?? ""
			let from = parseLocalDay(fromStr) ?? Date()
			let toStart = parseLocalDay(toStr) ?? from
			// EventKit end is exclusive; include the whole local `to` day.
			let to = Calendar.current.date(byAdding: .day, value: 1, to: toStart)
				?? toStart.addingTimeInterval(86400)
			var calIds = request.query.filter { $0.name == "calendarId" }.map(\.value)
			if calIds.isEmpty, let csv = request.query["calendarIds"], !csv.isEmpty {
				calIds = csv.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) }
			}
			let events = bridge.events(from: from, to: to, calendarIds: calIds)
			return jsonResponse(["events": events])
		}

		if path.hasPrefix("/reminders/") {
			let parts = path.split(separator: "/").map(String.init)
			guard parts.count >= 3, let id = Int(parts[2]) else {
				return HTTPResponse(statusCode: .badRequest, body: "Invalid reminder id".data(using: .utf8)!)
			}
			let action = parts.count > 3 ? parts[3] : ""
			if method == "POST" && action == "complete" {
				try bridge.complete(id: id, done: true)
				return HTTPResponse(statusCode: .noContent)
			}
			if method == "POST" && action == "reopen" {
				try bridge.complete(id: id, done: false)
				return HTTPResponse(statusCode: .noContent)
			}
			if method == "DELETE" {
				try bridge.deleteReminder(id: id)
				return HTTPResponse(statusCode: .noContent)
			}
			if method == "PATCH" {
				let body = try await readJsonBody(request)
				try bridge.editReminder(id: id, body: body)
				return HTTPResponse(statusCode: .noContent)
			}
		}

		return HTTPResponse(statusCode: .notFound, body: "Not found".data(using: .utf8)!)
	}

	private func parseLocalDay(_ s: String) -> Date? {
		let parts = s.prefix(10).split(separator: "-").compactMap { Int($0) }
		guard parts.count == 3 else { return nil }
		return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
	}

	private func jsonResponse<T: Encodable>(_ value: T) -> HTTPResponse {
		let data = (try? JSONEncoder().encode(value)) ?? Data("{}".utf8)
		return HTTPResponse(
			statusCode: .ok,
			headers: [.contentType: "application/json"],
			body: data
		)
	}

	private func readJsonBody(_ request: HTTPRequest) async throws -> [String: Any] {
		let body = try await request.bodyData
		let obj = try JSONSerialization.jsonObject(with: body)
		return obj as? [String: Any] ?? [:]
	}
}
