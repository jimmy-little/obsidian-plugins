import Foundation

enum WidgetBridgeOp: String, Codable {
	case start
	case stop
	case stopAll = "stop_all"
}

struct WidgetBridgePendingCommand: Codable, Identifiable {
	var id: String
	var op: WidgetBridgeOp
	var quickStartId: String?
	var notePath: String?
	var startMs: Int64?
	var createdAt: String
	var processedAt: String?
	var processedBy: String?
}

struct WidgetBridgeActiveTimer: Codable, Identifiable {
	var notePath: String
	var label: String
	var startMs: Int64
	var project: String?
	var entryId: String?
	var quickStartId: String?

	var id: String { entryId ?? "\(notePath)-\(startMs)" }

	var startDate: Date { Date(timeIntervalSince1970: TimeInterval(startMs) / 1000.0) }
}

struct WidgetBridgeQuickStartItem: Codable, Identifiable {
	var id: String
	var label: String
	var kind: String
	var templatePath: String?
	var templateName: String?
	var project: String?
	var projectSourcePath: String?
	var area: String?
	var timerDescription: String?
}

struct WidgetBridgeTimerSettingsSnapshot: Codable {
	var entriesKey: String
	var legacyEntriesKeys: [String]
	var startTimeKey: String
	var endTimeKey: String
	var totalTimeKey: String
	var projectKey: String
	var dateFormat: String
	var showSeconds: Bool
	var timerButtonTemplatesFolder: String
	var excludedFolders: [String]
}

struct WidgetBridgeFile: Codable {
	static let defaultRelativePath = "Fulcrum/.widget-bridge.json"

	var version: Int
	var deviceId: String
	var updatedAt: String
	var lastReconciledAt: String?
	var activeTimers: [WidgetBridgeActiveTimer]
	var quickStartItems: [WidgetBridgeQuickStartItem]
	var timerSettings: WidgetBridgeTimerSettingsSnapshot
	var pendingCommands: [WidgetBridgePendingCommand]

	static func empty(deviceId: String) -> WidgetBridgeFile {
		let now = ISO8601DateFormatter().string(from: Date())
		return WidgetBridgeFile(
			version: 1,
			deviceId: deviceId,
			updatedAt: now,
			lastReconciledAt: nil,
			activeTimers: [],
			quickStartItems: [],
			timerSettings: WidgetBridgeTimerSettingsSnapshot(
				entriesKey: "fulcrumTimerEntries",
				legacyEntriesKeys: ["timeEntries", "lapseEntries"],
				startTimeKey: "startTime",
				endTimeKey: "endTime",
				totalTimeKey: "totalTimeTracked",
				projectKey: "project",
				dateFormat: "YYYY-MM-DD HH:mm:ss",
				showSeconds: true,
				timerButtonTemplatesFolder: "Templates/Fulcrum Timer Buttons",
				excludedFolders: []
			),
			pendingCommands: []
		)
	}
}
