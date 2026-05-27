import Foundation

/// Fast cache for widgets; main app refreshes from the vault bridge file.
enum AppGroupStore {
	static let suiteName = "group.com.fulcrum.companion"
	private static let bridgeKey = "fulcrum.widgetBridge.snapshot"
	private static let bridgePathKey = "fulcrum.widgetBridge.relativePath"
	private static let vaultBookmarkKey = "fulcrum.vault.bookmark"

	static var defaults: UserDefaults? {
		UserDefaults(suiteName: suiteName)
	}

	static func loadSnapshot() -> WidgetBridgeFile? {
		guard let data = defaults?.data(forKey: bridgeKey) else { return nil }
		return try? JSONDecoder().decode(WidgetBridgeFile.self, from: data)
	}

	static func saveSnapshot(_ bridge: WidgetBridgeFile) {
		guard let data = try? JSONEncoder().encode(bridge) else { return }
		defaults?.set(data, forKey: bridgeKey)
	}

	static var bridgeRelativePath: String {
		get { defaults?.string(forKey: bridgePathKey) ?? WidgetBridgeFile.defaultRelativePath }
		set { defaults?.set(newValue, forKey: bridgePathKey) }
	}

	static func saveVaultBookmark(_ data: Data) {
		defaults?.set(data, forKey: vaultBookmarkKey)
	}

	static func loadVaultBookmark() -> Data? {
		defaults?.data(forKey: vaultBookmarkKey)
	}
}
