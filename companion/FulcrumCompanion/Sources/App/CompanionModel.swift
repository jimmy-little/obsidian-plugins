import Foundation
import WidgetKit

@MainActor
final class CompanionModel: ObservableObject {
	@Published var vaultDisplayName: String = ""
	@Published var bridge: WidgetBridgeFile?
	@Published var errorMessage: String?
	@Published var isRefreshing = false

	private var vaultURL: URL?

	func loadFromCache() {
		bridge = AppGroupStore.loadSnapshot()
		if let url = VaultAccess.resolveVaultURL() {
			vaultURL = url
			vaultDisplayName = url.lastPathComponent
		}
	}

	func setVault(url: URL) {
		do {
			try VaultAccess.saveVaultBookmark(for: url)
			vaultURL = url
			vaultDisplayName = url.lastPathComponent
			errorMessage = nil
			Task { await refresh() }
		} catch {
			errorMessage = error.localizedDescription
		}
	}

	func refresh() async {
		guard let vaultURL else {
			errorMessage = BridgeClientError.vaultNotConfigured.localizedDescription
			return
		}
		isRefreshing = true
		defer { isRefreshing = false }

		do {
			let bridge = try VaultAccess.withSecurityScope(vaultURL) {
				let client = BridgeClient(vaultURL: vaultURL)
				return try client.refreshAppGroupCache()
			}
			self.bridge = bridge
			errorMessage = nil
			WidgetCenter.shared.reloadAllTimelines()
		} catch {
			errorMessage = error.localizedDescription
		}
	}

	func isQuickStartRunning(_ item: WidgetBridgeQuickStartItem) -> Bool {
		bridge?.activeTimers.contains { $0.quickStartId == item.id } ?? false
	}

	func toggleQuickStart(_ item: WidgetBridgeQuickStartItem) async {
		if let active = bridge?.activeTimers.first(where: { $0.quickStartId == item.id }) {
			await stopTimer(active)
			return
		}
		await startQuickStart(item)
	}

	func startQuickStart(_ item: WidgetBridgeQuickStartItem) async {
		let optimistic = optimisticTimer(for: item)
		var active = bridge?.activeTimers.filter { $0.quickStartId != item.id } ?? []
		active.append(optimistic)
		await mutateBridge { client in
			let cmd = BridgeClient.startQuickStartCommand(quickStartId: item.id)
			return try client.enqueue(cmd, optimisticActive: active)
		}
	}

	private func optimisticTimer(for item: WidgetBridgeQuickStartItem) -> WidgetBridgeActiveTimer {
		let notePath = item.projectSourcePath ?? item.templatePath ?? ""
		return WidgetBridgeActiveTimer(
			notePath: notePath,
			label: item.label,
			startMs: Int64(Date().timeIntervalSince1970 * 1000),
			project: item.project,
			entryId: nil,
			quickStartId: item.id
		)
	}

	func stopTimer(_ timer: WidgetBridgeActiveTimer) async {
		await mutateBridge { client in
			let cmd = BridgeClient.stopTimerCommand(notePath: timer.notePath, startMs: timer.startMs)
			var remaining = try client.read().activeTimers.filter { $0.id != timer.id }
			if let qs = timer.quickStartId {
				remaining.removeAll { $0.quickStartId == qs }
			}
			return try client.enqueue(cmd, optimisticActive: remaining)
		}
	}

	func stopAll() async {
		await mutateBridge { client in
			let cmd = BridgeClient.stopAllCommand()
			return try client.enqueue(cmd, optimisticActive: [])
		}
	}

	private func mutateBridge(_ work: (inout BridgeClient) throws -> WidgetBridgeFile) async {
		guard let vaultURL else {
			errorMessage = BridgeClientError.vaultNotConfigured.localizedDescription
			return
		}
		do {
			let updated = try VaultAccess.withSecurityScope(vaultURL) {
				var client = BridgeClient(vaultURL: vaultURL)
				return try work(&client)
			}
			bridge = updated
			errorMessage = nil
			WidgetCenter.shared.reloadAllTimelines()
		} catch {
			errorMessage = error.localizedDescription
		}
	}
}
