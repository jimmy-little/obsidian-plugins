import FlyingFox
import Foundation

struct HTTPHandlers {
	let bridge: EventKitBridge
	let omnifocus: OmniFocusBridge

	func route(_ request: HTTPRequest) async throws -> HTTPResponse {
		let path = request.path
		let method = request.method.rawValue

		if path == "/health" && method == "GET" {
			let auth = bridge.authorizationStatus()
			let ok = (auth["reminders"] == "fullAccess" || auth["reminders"] == "authorized")
				&& (auth["calendar"] == "fullAccess" || auth["calendar"] == "authorized")
			let of = omnifocus.health(probeAutomation: false)
			// Avoid EventKit queries while TCC prompts are outstanding — they can hang the handler.
			let calendarCount: Int
			if ok {
				calendarCount = (try? await bridge.calendars())?.count ?? 0
			} else {
				calendarCount = 0
			}
			return jsonResponse(
				HealthResponse(
					ok: ok,
					status: ok ? "ok" : "needs_permission",
					authorization: auth,
					calendarCount: calendarCount,
					remindersRevision: bridge.currentRevision(),
					omnifocus: of
				)
			)
		}

		if let ofResponse = try await omnifocusRoute(path: path, method: method, request: request) {
			return ofResponse
		}

		do {
			return try await remindersAndCalendarRoute(path: path, method: method, request: request)
		} catch let error as EventKitNotFoundError {
			return HTTPResponse(statusCode: .notFound, body: Data(error.message.utf8))
		}
	}

	private func remindersAndCalendarRoute(
		path: String,
		method: String,
		request: HTTPRequest
	) async throws -> HTTPResponse {
		if path == "/lists" && method == "GET" {
			return jsonResponse(["lists": try await bridge.lists()])
		}

		if path == "/lists" && method == "POST" {
			let body = try await readJsonBody(request)
			let name = (body["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
			guard !name.isEmpty else {
				return HTTPResponse(statusCode: .badRequest, body: Data("Missing list name".utf8))
			}
			let listId = try await bridge.createList(name: name)
			if let colorBody = body["color"] as? [String: Any] {
				try? await bridge.editList(id: listId, body: colorBody)
			} else if body["color"] != nil {
				try? await bridge.editList(id: listId, body: body)
			}
			return jsonResponse(["listId": listId, "id": listId])
		}

		if path.hasPrefix("/lists/") && method == "PATCH" {
			let parts = path.split(separator: "/").map(String.init)
			guard parts.count >= 2 else {
				return HTTPResponse(statusCode: .badRequest, body: Data("Missing list id".utf8))
			}
			let id = decodePathId(parts[1])
			guard !id.isEmpty else {
				return HTTPResponse(statusCode: .badRequest, body: Data("Missing list id".utf8))
			}
			let body = try await readJsonBody(request)
			try await bridge.editList(id: id, body: body)
			return HTTPResponse(statusCode: .noContent)
		}

		if path == "/reminders/revision" && method == "GET" {
			return jsonResponse(["revision": bridge.currentRevision()])
		}

		if path == "/reminders" && method == "GET" {
			var listIds: [String] = []
			if let csv = emptyToNil(request.query["listIds"]) {
				listIds = csv.split(separator: ",").map {
					String($0).trimmingCharacters(in: .whitespacesAndNewlines)
				}.filter { !$0.isEmpty }
			}
			listIds.append(contentsOf: request.query.filter { $0.name == "listId" }.map(\.value))
			let inbox = boolQuery(request.query["inbox"]) ?? false
			let reminders = try await bridge.reminders(listIds: listIds, inbox: inbox)
			return jsonResponse(["reminders": reminders])
		}

		if path == "/reminders" && method == "POST" {
			let body = try await readJsonBody(request)
			let id = try await bridge.createReminder(body: body)
			return jsonResponse(["id": id])
		}

		if path == "/calendars" && method == "GET" {
			return jsonResponse(["calendars": try await bridge.calendars()])
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
			let events = try await bridge.events(from: from, to: to, calendarIds: calIds)
			return jsonResponse(["events": events])
		}

		if path.hasPrefix("/reminders/") {
			let parts = path.split(separator: "/").map(String.init)
			guard parts.count >= 2 else {
				return HTTPResponse(statusCode: .badRequest, body: Data("Invalid reminder id".utf8))
			}
			let id = decodePathId(parts[1])
			guard !id.isEmpty else {
				return HTTPResponse(statusCode: .badRequest, body: Data("Invalid reminder id".utf8))
			}
			let action = parts.count > 2 ? parts[2] : ""
			if method == "GET" && action.isEmpty {
				return jsonResponse(try await bridge.reminder(id: id))
			}
			if method == "POST" && action == "complete" {
				try await bridge.complete(id: id, done: true)
				return HTTPResponse(statusCode: .noContent)
			}
			if method == "POST" && action == "reopen" {
				try await bridge.complete(id: id, done: false)
				return HTTPResponse(statusCode: .noContent)
			}
			if method == "DELETE" && action.isEmpty {
				try await bridge.deleteReminder(id: id)
				return HTTPResponse(statusCode: .noContent)
			}
			if method == "PATCH" && action.isEmpty {
				let body = try await readJsonBody(request)
				try await bridge.editReminder(id: id, body: body)
				return HTTPResponse(statusCode: .noContent)
			}
		}

		return HTTPResponse(statusCode: .notFound, body: Data("Not found".utf8))
	}

	private func omnifocusRoute(path: String, method: String, request: HTTPRequest) async throws -> HTTPResponse? {
		guard path == "/omnifocus" || path.hasPrefix("/omnifocus/") else { return nil }

		if path == "/omnifocus/health" && method == "GET" {
			let probe = boolQuery(request.query["probe"]) ?? false
			return jsonResponse(omnifocus.health(probeAutomation: probe))
		}
		if path == "/omnifocus/projects" && method == "GET" {
			return jsonResponse(["projects": try omnifocus.projects()])
		}
		if path == "/omnifocus/projects" && method == "POST" {
			let body = try await readJsonBody(request)
			let name = (body["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
			guard !name.isEmpty else {
				return HTTPResponse(statusCode: .badRequest, body: Data("Missing project name".utf8))
			}
			let id = try omnifocus.createProject(name: name)
			return jsonResponse(["id": id])
		}
		if path == "/omnifocus/tasks" && method == "GET" {
			let projectId = emptyToNil(request.query["projectId"])
			var projectIds: [String] = []
			if let csv = emptyToNil(request.query["projectIds"]) {
				projectIds = csv.split(separator: ",").map {
					String($0).trimmingCharacters(in: .whitespacesAndNewlines)
				}.filter { !$0.isEmpty }
			}
			let inbox = boolQuery(request.query["inbox"])
			let completed = emptyToNil(request.query["completed"])
			let tasks = try omnifocus.tasks(
				projectId: projectId,
				projectIds: projectIds.isEmpty ? nil : projectIds,
				inbox: inbox,
				completed: completed
			)
			return jsonResponse(["tasks": tasks])
		}
		if path == "/omnifocus/tasks" && method == "POST" {
			let body = try await readJsonBody(request)
			let id = try omnifocus.createTask(body: body)
			return jsonResponse(["id": id])
		}
		if path == "/omnifocus/sync" && method == "POST" {
			try omnifocus.synchronize()
			return HTTPResponse(statusCode: .noContent)
		}

		if path.hasPrefix("/omnifocus/tasks/") {
			let parts = path.split(separator: "/").map(String.init)
			guard parts.count >= 3 else { return nil }
			let id = parts[2]
			guard !id.isEmpty else {
				return HTTPResponse(statusCode: .badRequest, body: Data("Missing task id".utf8))
			}
			let action = parts.count > 3 ? parts[3] : ""
			if method == "POST" && action == "complete" {
				try omnifocus.updateTask(id: id, body: ["completed": true])
				return HTTPResponse(statusCode: .noContent)
			}
			if method == "POST" && action == "reopen" {
				try omnifocus.updateTask(id: id, body: ["completed": false])
				return HTTPResponse(statusCode: .noContent)
			}
			if method == "PATCH" && action.isEmpty {
				let body = try await readJsonBody(request)
				try omnifocus.updateTask(id: id, body: body)
				return HTTPResponse(statusCode: .noContent)
			}
		}

		return HTTPResponse(statusCode: .notFound, body: Data("Not found".utf8))
	}

	private func decodePathId(_ raw: String) -> String {
		raw.removingPercentEncoding ?? raw
	}

	private func emptyToNil(_ value: String?) -> String? {
		let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
		return trimmed.isEmpty ? nil : trimmed
	}

	private func boolQuery(_ value: String?) -> Bool? {
		guard let value else { return nil }
		switch value.lowercased() {
		case "1", "true", "yes": return true
		case "0", "false", "no": return false
		default: return nil
		}
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
