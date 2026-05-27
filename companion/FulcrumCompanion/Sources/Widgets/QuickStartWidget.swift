import AppIntents
import SwiftUI
import WidgetKit

// MARK: - App Intents

struct StartQuickStartIntent: AppIntent {
	static var title: LocalizedStringResource = "Start Fulcrum timer"
	static var description = IntentDescription("Queue a Fulcrum quick start via the vault bridge.")

	@Parameter(title: "Quick start id")
	var quickStartId: String

	init() {}

	init(quickStartId: String) {
		self.quickStartId = quickStartId
	}

	func perform() async throws -> some IntentResult {
		guard let vaultURL = VaultAccess.resolveVaultURL() else {
			return .result()
		}
		try VaultAccess.withSecurityScope(vaultURL) {
			var client = BridgeClient(vaultURL: vaultURL)
			let cmd = BridgeClient.startQuickStartCommand(quickStartId: quickStartId)
			_ = try client.enqueue(cmd, optimisticActive: nil)
		}
		WidgetCenter.shared.reloadAllTimelines()
		return .result()
	}
}

struct StopAllTimersIntent: AppIntent {
	static var title: LocalizedStringResource = "Stop all Fulcrum timers"

	func perform() async throws -> some IntentResult {
		guard let vaultURL = VaultAccess.resolveVaultURL() else {
			return .result()
		}
		try VaultAccess.withSecurityScope(vaultURL) {
			var client = BridgeClient(vaultURL: vaultURL)
			_ = try client.enqueue(BridgeClient.stopAllCommand(), optimisticActive: [])
		}
		WidgetCenter.shared.reloadAllTimelines()
		return .result()
	}
}

// MARK: - Widget

struct QuickStartEntry: TimelineEntry {
	let date: Date
	let state: BridgeWidgetState
}

struct QuickStartProvider: TimelineProvider {
	func placeholder(in context: Context) -> QuickStartEntry {
		QuickStartEntry(date: Date(), state: BridgeWidgetState.load())
	}

	func getSnapshot(in context: Context, completion: @escaping (QuickStartEntry) -> Void) {
		completion(QuickStartEntry(date: Date(), state: BridgeWidgetState.load()))
	}

	func getTimeline(in context: Context, completion: @escaping (Timeline<QuickStartEntry>) -> Void) {
		let entry = QuickStartEntry(date: Date(), state: BridgeWidgetState.load())
		let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
		completion(Timeline(entries: [entry], policy: .after(next)))
	}
}

struct QuickStartWidgetView: View {
	var entry: QuickStartEntry

	var body: some View {
		VStack(alignment: .leading, spacing: 8) {
			Text("Quick start")
				.font(.caption)
				.foregroundStyle(.secondary)
			if entry.state.quickStartItems.isEmpty {
				Text("Open Fulcrum app to load buttons")
					.font(.footnote)
			} else {
				ForEach(entry.state.quickStartItems.prefix(4)) { item in
					Button(intent: StartQuickStartIntent(quickStartId: item.id)) {
						Text(item.label)
							.font(.subheadline)
							.lineLimit(1)
							.frame(maxWidth: .infinity, alignment: .leading)
					}
					.buttonStyle(.bordered)
				}
			}
			Button(intent: StopAllTimersIntent()) {
				Label("Stop all", systemImage: "stop.fill")
					.font(.caption)
			}
			.tint(.red)
		}
		.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
	}
}

struct QuickStartWidget: Widget {
	let kind = "FulcrumQuickStart"

	var body: some WidgetConfiguration {
		StaticConfiguration(kind: kind, provider: QuickStartProvider()) { entry in
			QuickStartWidgetView(entry: entry)
				.containerBackground(.fill.tertiary, for: .widget)
		}
		.configurationDisplayName("Quick start")
		.description("Start Fulcrum timers from your quick start templates.")
		.supportedFamilies([.systemMedium, .systemLarge])
	}
}
