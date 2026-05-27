import Foundation

struct BridgeWidgetState {
	let bridge: WidgetBridgeFile
	let loadedAt: Date

	static func load() -> BridgeWidgetState {
		let bridge = AppGroupStore.loadSnapshot() ?? WidgetBridgeFile.empty(deviceId: "widget")
		return BridgeWidgetState(bridge: bridge, loadedAt: Date())
	}

	var primaryTimer: WidgetBridgeActiveTimer? {
		bridge.activeTimers.first
	}

	var quickStartItems: [WidgetBridgeQuickStartItem] {
		Array(bridge.quickStartItems.prefix(8))
	}
}
