import Foundation

enum BridgeClientError: LocalizedError {
	case vaultNotConfigured
	case bridgeUnreadable
	case bridgeUnwritable

	var errorDescription: String? {
		switch self {
		case .vaultNotConfigured: return "Obsidian vault folder is not selected."
		case .bridgeUnreadable: return "Could not read the widget bridge file."
		case .bridgeUnwritable: return "Could not write the widget bridge file."
		}
	}
}

/// Reads/writes `Fulcrum/.widget-bridge.json` inside the vault.
struct BridgeClient {
	let vaultURL: URL
	var relativeBridgePath: String

	init(vaultURL: URL, relativeBridgePath: String = AppGroupStore.bridgeRelativePath) {
		self.vaultURL = vaultURL
		self.relativeBridgePath = relativeBridgePath
	}

	var bridgeURL: URL {
		vaultURL.appendingPathComponent(relativeBridgePath)
	}

	func read() throws -> WidgetBridgeFile {
		let url = bridgeURL
		guard FileManager.default.fileExists(atPath: url.path) else {
			return WidgetBridgeFile.empty(deviceId: UUID().uuidString)
		}
		let data = try Data(contentsOf: url)
		let decoded = try JSONDecoder().decode(WidgetBridgeFile.self, from: data)
		return decoded
	}

	func write(_ bridge: WidgetBridgeFile) throws {
		var payload = bridge
		payload.updatedAt = ISO8601DateFormatter().string(from: Date())

		let url = bridgeURL
		let folder = url.deletingLastPathComponent()
		try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

		let encoder = JSONEncoder()
		encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
		let data = try encoder.encode(payload)
		var text = String(data: data, encoding: .utf8) ?? ""
		if !text.hasSuffix("\n") { text += "\n" }

		try text.write(to: url, atomically: true, encoding: .utf8)
	}

	/// Append a command and optimistically update active timers for widget UI.
	mutating func enqueue(_ command: WidgetBridgePendingCommand, optimisticActive: [WidgetBridgeActiveTimer]? = nil) throws -> WidgetBridgeFile {
		var bridge = try read()
		if command.op == .start, let qs = command.quickStartId {
			bridge.pendingCommands.removeAll { pending in
				pending.processedAt == nil && pending.op == .start && pending.quickStartId == qs
			}
		}
		bridge.pendingCommands.append(command)
		if let optimisticActive {
			bridge.activeTimers = optimisticActive
		}
		try write(bridge)
		AppGroupStore.saveSnapshot(bridge)
		return bridge
	}

	func refreshAppGroupCache() throws -> WidgetBridgeFile {
		let bridge = try read()
		AppGroupStore.saveSnapshot(bridge)
		return bridge
	}
}

extension BridgeClient {
	static func startQuickStartCommand(quickStartId: String) -> WidgetBridgePendingCommand {
		WidgetBridgePendingCommand(
			id: UUID().uuidString,
			op: .start,
			quickStartId: quickStartId,
			notePath: nil,
			startMs: nil,
			createdAt: ISO8601DateFormatter().string(from: Date()),
			processedAt: nil,
			processedBy: nil
		)
	}

	static func stopTimerCommand(notePath: String, startMs: Int64?) -> WidgetBridgePendingCommand {
		WidgetBridgePendingCommand(
			id: UUID().uuidString,
			op: .stop,
			quickStartId: nil,
			notePath: notePath,
			startMs: startMs,
			createdAt: ISO8601DateFormatter().string(from: Date()),
			processedAt: nil,
			processedBy: nil
		)
	}

	static func stopAllCommand() -> WidgetBridgePendingCommand {
		WidgetBridgePendingCommand(
			id: UUID().uuidString,
			op: .stopAll,
			quickStartId: nil,
			notePath: nil,
			startMs: nil,
			createdAt: ISO8601DateFormatter().string(from: Date()),
			processedAt: nil,
			processedBy: nil
		)
	}
}
