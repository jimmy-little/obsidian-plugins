import CoreGraphics
import EventKit
import Foundation

struct EventKitNotFoundError: LocalizedError {
	let message: String
	var errorDescription: String? { message }
}

struct BridgeReminder: Codable {
	let id: String
	let title: String
	let completed: Bool
	let dueDate: String?
	let notes: String
	let listId: String?
	let listName: String?
	let tags: [String]
	let lastModified: String?
	let externalId: String?
	let recurring: Bool
}

struct BridgeList: Codable {
	let id: String
	let name: String
	let color: String?
	let isDefault: Bool
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

final class EventKitBridge: @unchecked Sendable {
	private let store = EKEventStore()
	private let queue = DispatchQueue(label: "com.fulcrum.eventkit", qos: .userInitiated)
	private let revisionLock = NSLock()
	private var _revision: UInt64 = 0
	private var observer: NSObjectProtocol?
	private let isoDateTime: ISO8601DateFormatter = {
		let f = ISO8601DateFormatter()
		f.formatOptions = [.withFullDate, .withTime, .withColonSeparatorInTime]
		return f
	}()
	private let isoInstant: ISO8601DateFormatter = {
		let f = ISO8601DateFormatter()
		f.formatOptions = [.withInternetDateTime]
		return f
	}()

	init() {
		observer = NotificationCenter.default.addObserver(
			forName: .EKEventStoreChanged,
			object: store,
			queue: nil,
		) { [weak self] _ in
			self?.bumpRevision()
		}
	}

	deinit {
		if let observer {
			NotificationCenter.default.removeObserver(observer)
		}
	}

	func bumpRevision() {
		revisionLock.lock()
		_revision &+= 1
		revisionLock.unlock()
	}

	func currentRevision() -> UInt64 {
		revisionLock.lock()
		defer { revisionLock.unlock() }
		return _revision
	}

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

	func lists() async throws -> [BridgeList] {
		try await onQueue {
			let defaultId = self.store.defaultCalendarForNewReminders()?.calendarIdentifier
			return self.store.calendars(for: .reminder).map { cal in
				BridgeList(
					id: cal.calendarIdentifier,
					name: cal.title,
					color: Self.hexColor(cal.cgColor),
					isDefault: cal.calendarIdentifier == defaultId,
				)
			}
		}
	}

	func createList(name: String) async throws -> String {
		try await onQueue {
			let cal = EKCalendar(for: .reminder, eventStore: self.store)
			cal.title = name
			// Prefer the same account as the default Reminders list (usually iCloud), not a Mac-only local source.
			if let src = self.store.defaultCalendarForNewReminders()?.source {
				cal.source = src
			} else if let src = self.store.sources.first(where: { $0.sourceType == .calDAV }) {
				cal.source = src
			} else if let src = self.store.sources.first(where: { $0.sourceType == .local }) {
				cal.source = src
			} else if let src = self.store.sources.first {
				cal.source = src
			}
			try self.store.saveCalendar(cal, commit: true)
			self.bumpRevision()
			return cal.calendarIdentifier
		}
	}

	func editList(id: String, body: [String: Any]) async throws {
		try await onQueue {
			guard let cal = self.reminderCalendar(id: id) else {
				throw EventKitNotFoundError(message: "List not found: \(id)")
			}
			if let color = body["color"] as? String, let cg = Self.parseColor(color) {
				cal.cgColor = cg
			}
			try self.store.saveCalendar(cal, commit: true)
			self.bumpRevision()
		}
	}

	func reminders(listIds: [String] = [], inbox: Bool = false) async throws -> [BridgeReminder] {
		try await fetchReminders(listIds: listIds, inbox: inbox)
	}

	private func mapReminder(_ item: EKReminder) -> BridgeReminder {
		let due = Self.formatDue(item.dueDateComponents)
		let modified = item.lastModifiedDate.map { isoInstant.string(from: $0) }
		let recurring = !(item.recurrenceRules ?? []).isEmpty
		return BridgeReminder(
			id: item.calendarItemIdentifier,
			title: item.title ?? "",
			completed: item.isCompleted,
			dueDate: due,
			notes: item.notes ?? "",
			listId: item.calendar?.calendarIdentifier,
			listName: item.calendar?.title,
			tags: [],
			lastModified: modified,
			externalId: item.calendarItemExternalIdentifier,
			recurring: recurring,
		)
	}

	func complete(id: String, done: Bool) async throws {
		try await onQueue {
			let rem = try self.requireReminder(id: id)
			rem.isCompleted = done
			try self.store.save(rem, commit: true)
			self.bumpRevision()
		}
	}

	func deleteReminder(id: String) async throws {
		try await onQueue {
			let rem = try self.requireReminder(id: id)
			try self.store.remove(rem, commit: true)
			self.bumpRevision()
		}
	}

	func editReminder(id: String, body: [String: Any]) async throws {
		try await onQueue {
			let rem = try self.requireReminder(id: id)
			self.applyPatch(rem, body: body)
			try self.store.save(rem, commit: true)
			self.bumpRevision()
		}
	}

	func reminder(id: String) async throws -> BridgeReminder {
		try await onQueue {
			self.mapReminder(try self.requireReminder(id: id))
		}
	}

	func createReminder(body: [String: Any]) async throws -> String {
		try await onQueue {
			let rem = EKReminder(eventStore: self.store)
			rem.title = (body["title"] as? String) ?? (body["name"] as? String) ?? "Task"
			self.applyPatch(rem, body: body)
			if rem.calendar == nil {
				if let listId = body["listId"] as? String {
					guard let cal = self.reminderCalendar(id: listId) else {
						throw EventKitNotFoundError(message: "List not found: \(listId)")
					}
					rem.calendar = cal
				} else if let listName = body["listName"] as? String,
				          let cal = self.reminderCalendar(named: listName) {
					rem.calendar = cal
				} else if let cal = self.store.defaultCalendarForNewReminders() {
					rem.calendar = cal
				}
			}
			guard rem.calendar != nil else {
				throw EventKitNotFoundError(message: "No Reminders list available for create")
			}
			try self.store.save(rem, commit: true)
			self.bumpRevision()
			return rem.calendarItemIdentifier
		}
	}

	func calendars() async throws -> [BridgeCalendar] {
		try await onQueue {
			self.store.calendars(for: .event).map { cal in
				BridgeCalendar(
					id: cal.calendarIdentifier,
					title: cal.title,
					color: Self.hexColor(cal.cgColor),
				)
			}
		}
	}

	func events(from: Date, to: Date, calendarIds: [String]) async throws -> [BridgeEvent] {
		try await onQueue {
			let cals: [EKCalendar]
			if calendarIds.isEmpty {
				return [BridgeEvent]()
			} else {
				cals = calendarIds.compactMap { self.store.calendar(withIdentifier: $0) }
			}
			guard !cals.isEmpty else { return [] }
			let pred = self.store.predicateForEvents(withStart: from, end: to, calendars: cals)
			return self.store.events(matching: pred).map { ev in
				BridgeEvent(
					id: ev.eventIdentifier ?? UUID().uuidString,
					calendarId: ev.calendar.calendarIdentifier,
					title: ev.title,
					startIso: self.isoInstant.string(from: ev.startDate),
					endIso: ev.endDate.map { self.isoInstant.string(from: $0) },
					allDay: ev.isAllDay,
					location: ev.location,
				)
			}
		}
	}

	private func requireReminder(id: String) throws -> EKReminder {
		guard let item = store.calendarItem(withIdentifier: id) as? EKReminder else {
			throw EventKitNotFoundError(message: "Reminder not found: \(id)")
		}
		return item
	}

	/// `calendar(withIdentifier:)` misses reminder lists on some macOS versions; search EventKit reminder calendars.
	private func reminderCalendar(id: String) -> EKCalendar? {
		store.calendars(for: .reminder).first { $0.calendarIdentifier == id }
	}

	private func reminderCalendar(named name: String) -> EKCalendar? {
		store.calendars(for: .reminder).first { $0.title == name }
	}

	private func applyPatch(_ rem: EKReminder, body: [String: Any]) {
		if let title = (body["title"] as? String) ?? (body["name"] as? String) {
			rem.title = title
		}
		if let notes = body["notes"] as? String {
			rem.notes = notes
		}
		if let completed = body["completed"] as? Bool {
			rem.isCompleted = completed
		}
		if body["due"] is NSNull || body["dueDate"] is NSNull {
			rem.dueDateComponents = nil
		} else if let due = (body["due"] as? String) ?? (body["dueDate"] as? String) {
			if due.isEmpty {
				rem.dueDateComponents = nil
			} else if let d = isoDateTime.date(from: due) ?? isoInstant.date(from: due) ?? Self.parseYmd(due) {
				let hasTime = due.contains("T") || due.contains(" ")
				if hasTime {
					rem.dueDateComponents = Calendar.current.dateComponents(
						[.year, .month, .day, .hour, .minute],
						from: d,
					)
				} else {
					rem.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day], from: d)
				}
			}
		}
		if let listId = body["listId"] as? String, let cal = reminderCalendar(id: listId) {
			rem.calendar = cal
		} else if let listName = body["listName"] as? String, let cal = reminderCalendar(named: listName) {
			rem.calendar = cal
		}
	}

	private func fetchReminders(listIds: [String], inbox: Bool) async throws -> [BridgeReminder] {
		try await withCheckedThrowingContinuation { cont in
			queue.async {
				let calendars: [EKCalendar]?
				if inbox {
					if let def = self.store.defaultCalendarForNewReminders() {
						calendars = [def]
					} else {
						calendars = []
					}
				} else if listIds.isEmpty {
					calendars = self.store.calendars(for: .reminder)
				} else {
					calendars = listIds.compactMap { self.reminderCalendar(id: $0) }
				}
				if let calendars, calendars.isEmpty {
					cont.resume(returning: [])
					return
				}
				let pred = self.store.predicateForReminders(in: calendars)
				self.store.fetchReminders(matching: pred) { items in
					self.queue.async {
						let rows = (items ?? []).map { self.mapReminder($0) }
						cont.resume(returning: rows)
					}
				}
			}
		}
	}

	private func onQueue<T>(_ work: @escaping () throws -> T) async throws -> T {
		try await withCheckedThrowingContinuation { cont in
			queue.async {
				do {
					cont.resume(returning: try work())
				} catch {
					cont.resume(throwing: error)
				}
			}
		}
	}

	private static func formatDue(_ comps: DateComponents?) -> String? {
		guard let comps else { return nil }
		guard let year = comps.year, let month = comps.month, let day = comps.day else { return nil }
		if comps.hour == nil && comps.minute == nil {
			return String(format: "%04d-%02d-%02d", year, month, day)
		}
		guard let date = Calendar.current.date(from: comps) else {
			return String(format: "%04d-%02d-%02d", year, month, day)
		}
		let f = ISO8601DateFormatter()
		f.formatOptions = [.withFullDate, .withTime, .withColonSeparatorInTime]
		return f.string(from: date)
	}

	private static func parseYmd(_ s: String) -> Date? {
		let parts = s.prefix(10).split(separator: "-").compactMap { Int($0) }
		guard parts.count == 3 else { return nil }
		return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
	}

	private static func hexColor(_ color: CGColor?) -> String? {
		guard let color, let comps = color.components, comps.count >= 3 else { return nil }
		let r = Int((comps[0] * 255).rounded())
		let g = Int((comps[1] * 255).rounded())
		let b = Int((comps[2] * 255).rounded())
		return String(format: "#%02X%02X%02X", r, g, b)
	}

	private static let namedColors: [String: String] = [
		"red": "#FF3B30",
		"orange": "#FF9500",
		"yellow": "#FFCC00",
		"green": "#34C759",
		"blue": "#007AFF",
		"purple": "#AF52DE",
		"pink": "#FF2D55",
		"gray": "#8E8E93",
		"grey": "#8E8E93",
		"brown": "#A2845E",
		"black": "#000000",
		"white": "#FFFFFF",
		"cyan": "#32ADE6",
		"mint": "#00C7BE",
		"teal": "#30B0C7",
		"navy": "#000080",
		"slate": "#708090",
	]

	private static func parseColor(_ raw: String) -> CGColor? {
		var hex = raw.trimmingCharacters(in: .whitespacesAndNewlines)
		if let named = namedColors[hex.lowercased()] {
			hex = named
		}
		if hex.hasPrefix("#") { hex.removeFirst() }
		if hex.count == 3 {
			hex = hex.map { "\($0)\($0)" }.joined()
		}
		guard hex.count == 6, let n = UInt32(hex, radix: 16) else { return nil }
		let r = CGFloat((n >> 16) & 0xff) / 255
		let g = CGFloat((n >> 8) & 0xff) / 255
		let b = CGFloat(n & 0xff) / 255
		return CGColor(red: r, green: g, blue: b, alpha: 1)
	}
}
