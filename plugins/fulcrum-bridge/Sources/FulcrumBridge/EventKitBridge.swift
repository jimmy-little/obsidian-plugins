import EventKit
import Foundation

struct BridgeReminder: Codable {
	let id: Int
	let title: String
	let completed: Bool
	let dueDate: String?
	let notes: String
	let listId: String?
	let listName: String?
	let tags: [String]
}

struct BridgeList: Codable {
	let id: String
	let name: String
}

struct BridgeCalendar: Codable {
	let id: String
	let title: String
	let color: String?
}

struct BridgeEvent: Codable {
	let id: String
	let calendarId: String
	let title: String
	let startIso: String
	let endIso: String?
	let allDay: Bool
	let location: String?
}

final class EventKitBridge {
	private let store = EKEventStore()

	@MainActor
	func requestAccess() async throws {
		let remindersOk = try await ensureFullAccess(label: "reminders", entity: .reminder) {
			try await self.store.requestFullAccessToReminders()
		}
		let calendarOk = try await ensureFullAccess(label: "calendar", entity: .event) {
			try await self.store.requestFullAccessToEvents()
		}
		let auth = authorizationStatus()
		fputs("Fulcrum Bridge permissions: reminders=\(auth["reminders"] ?? "?"), calendar=\(auth["calendar"] ?? "?")\n", stderr)
		if remindersOk && calendarOk { return }
		if remindersOk || calendarOk {
			fputs(
				"Fulcrum Bridge: partial access — calendar events need Calendar permission.\n" +
					"  First run: open .build/FulcrumBridge.app (approve Calendar when prompted)\n" +
					"  Or: System Settings → Privacy & Security → Calendars → Fulcrum Bridge\n",
				stderr,
			)
			return
		}
		let hint =
			"Run: open .build/FulcrumBridge.app — macOS shows Calendar/Reminders prompts for app bundles, not bare CLI binaries."
		throw NSError(
			domain: "FulcrumBridge",
			code: 1,
			userInfo: [NSLocalizedDescriptionKey: "Reminders and Calendar access denied. \(hint)"],
		)
	}

	private func hasFullAccess(_ status: EKAuthorizationStatus) -> Bool {
		switch status {
		case .fullAccess:
			return true
		case .authorized:
			return true
		default:
			return false
		}
	}

	private func ensureFullAccess(
		label: String,
		entity: EKEntityType,
		request: () async throws -> Bool,
	) async throws -> Bool {
		let before = EKEventStore.authorizationStatus(for: entity)
		if hasFullAccess(before) { return true }
		let granted = try await request()
		let after = EKEventStore.authorizationStatus(for: entity)
		fputs(
			"Fulcrum Bridge: \(label) request granted=\(granted), status \(authLabel(before)) → \(authLabel(after))\n",
			stderr,
		)
		if granted { return true }
		return hasFullAccess(after)
	}

	func authorizationStatus() -> [String: String] {
		[
			"reminders": authLabel(EKEventStore.authorizationStatus(for: .reminder)),
			"calendar": authLabel(EKEventStore.authorizationStatus(for: .event)),
		]
	}

	private func authLabel(_ status: EKAuthorizationStatus) -> String {
		switch status {
		case .notDetermined: return "notDetermined"
		case .restricted: return "restricted"
		case .denied: return "denied"
		case .authorized: return "authorized"
		case .fullAccess: return "fullAccess"
		case .writeOnly: return "writeOnly"
		@unknown default: return "unknown"
		}
	}

	func lists() -> [BridgeList] {
		store.calendars(for: .reminder).map { cal in
			BridgeList(id: cal.calendarIdentifier, name: cal.title)
		}
	}

	func createList(name: String) throws -> String {
		let cal = EKCalendar(for: .reminder, eventStore: store)
		cal.title = name
		if let src = store.sources.first(where: { $0.sourceType == .local }) {
			cal.source = src
		} else if let src = store.defaultCalendarForNewReminders()?.source {
			cal.source = src
		} else if let src = store.sources.first {
			cal.source = src
		}
		try store.saveCalendar(cal, commit: true)
		return cal.calendarIdentifier
	}

	func reminders() -> [BridgeReminder] {
		let cals = store.calendars(for: .reminder)
		let pred = store.predicateForReminders(in: cals)
		var rows: [BridgeReminder] = []
	 let sem = DispatchSemaphore(value: 0)
		store.fetchReminders(matching: pred) { items in
			for item in items ?? [] {
				rows.append(self.mapReminder(item))
			}
			sem.signal()
		}
		sem.wait()
		return rows
	}

	func mapReminder(_ item: EKReminder) -> BridgeReminder {
		let due: String? = {
			guard let comps = item.dueDateComponents else { return nil }
			if let d = Calendar.current.date(from: comps) {
				let f = ISO8601DateFormatter()
				f.formatOptions = [.withFullDate, .withTime, .withColonSeparatorInTime]
				return f.string(from: d)
			}
			return nil
		}()
		let tags: [String] = []
		return BridgeReminder(
			id: abs(item.calendarItemIdentifier.hashValue),
			title: item.title,
			completed: item.isCompleted,
			dueDate: due,
			notes: item.notes ?? "",
			listId: item.calendar.calendarIdentifier,
			listName: item.calendar.title,
			tags: tags
		)
	}

	func findReminder(numericId: Int) -> EKReminder? {
		for item in remindersMatchingAll() {
			if abs(item.calendarItemIdentifier.hashValue) == numericId { return item }
		}
		return nil
	}

	private func remindersMatchingAll() -> [EKReminder] {
		let cals = store.calendars(for: .reminder)
		let pred = store.predicateForReminders(in: cals)
		var rows: [EKReminder] = []
		let sem = DispatchSemaphore(value: 0)
		store.fetchReminders(matching: pred) { items in
			rows = items ?? []
			sem.signal()
		}
		sem.wait()
		return rows
	}

	func complete(id: Int, done: Bool) throws {
		guard let rem = findReminder(numericId: id) else { return }
		rem.isCompleted = done
		try store.save(rem, commit: true)
	}

	func deleteReminder(id: Int) throws {
		guard let rem = findReminder(numericId: id) else { return }
		try store.remove(rem, commit: true)
	}

	func editReminder(id: Int, body: [String: Any]) throws {
		guard let rem = findReminder(numericId: id) else { return }
		if let notes = body["notes"] as? String {
			rem.notes = notes
		}
		try store.save(rem, commit: true)
	}

	func createReminder(body: [String: Any]) throws -> Int {
		let rem = EKReminder(eventStore: store)
		rem.title = (body["title"] as? String) ?? "Task"
		if let notes = body["notes"] as? String { rem.notes = notes }
		if let listId = body["listId"] as? String,
		   let cal = store.calendar(withIdentifier: listId) {
			rem.calendar = cal
		} else if let listName = body["listName"] as? String,
				  let cal = store.calendars(for: .reminder).first(where: { $0.title == listName }) {
			rem.calendar = cal
		} else if let cal = store.defaultCalendarForNewReminders() {
			rem.calendar = cal
		}
		if let due = body["due"] as? String, !due.isEmpty {
			let f = ISO8601DateFormatter()
			f.formatOptions = [.withFullDate, .withTime, .withColonSeparatorInTime]
			if let d = f.date(from: due) ?? parseYmd(due) {
				rem.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: d)
			}
		}
		try store.save(rem, commit: true)
		return abs(rem.calendarItemIdentifier.hashValue)
	}

	private func parseYmd(_ s: String) -> Date? {
		let parts = s.prefix(10).split(separator: "-").compactMap { Int($0) }
		guard parts.count == 3 else { return nil }
		return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
	}

	func calendars() -> [BridgeCalendar] {
		store.calendars(for: .event).map { cal in
			BridgeCalendar(id: cal.calendarIdentifier, title: cal.title, color: nil)
		}
	}

	func events(from: Date, to: Date, calendarIds: [String]) -> [BridgeEvent] {
		let cals: [EKCalendar]
		if calendarIds.isEmpty {
			return []
		} else {
			cals = calendarIds.compactMap { store.calendar(withIdentifier: $0) }
		}
		guard !cals.isEmpty else { return [] }
		let pred = store.predicateForEvents(withStart: from, end: to, calendars: cals)
		let f = ISO8601DateFormatter()
		f.formatOptions = [.withInternetDateTime]
		return store.events(matching: pred).map { ev in
			BridgeEvent(
				id: ev.eventIdentifier ?? UUID().uuidString,
				calendarId: ev.calendar.calendarIdentifier,
				title: ev.title,
				startIso: f.string(from: ev.startDate),
				endIso: ev.endDate.map { f.string(from: $0) },
				allDay: ev.isAllDay,
				location: ev.location
			)
		}
	}
}
