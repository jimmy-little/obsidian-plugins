import SwiftUI
import WidgetKit

struct ActiveTimerEntry: TimelineEntry {
	let date: Date
	let state: BridgeWidgetState
}

struct ActiveTimerProvider: TimelineProvider {
	func placeholder(in context: Context) -> ActiveTimerEntry {
		ActiveTimerEntry(date: Date(), state: BridgeWidgetState.load())
	}

	func getSnapshot(in context: Context, completion: @escaping (ActiveTimerEntry) -> Void) {
		completion(ActiveTimerEntry(date: Date(), state: BridgeWidgetState.load()))
	}

	func getTimeline(in context: Context, completion: @escaping (Timeline<ActiveTimerEntry>) -> Void) {
		let state = BridgeWidgetState.load()
		let entry = ActiveTimerEntry(date: Date(), state: state)
		let next = Calendar.current.date(byAdding: .minute, value: 1, to: Date()) ?? Date().addingTimeInterval(60)
		completion(Timeline(entries: [entry], policy: .after(next)))
	}
}

struct ActiveTimerWidgetView: View {
	@Environment(\.widgetFamily) private var family
	var entry: ActiveTimerEntry

	var body: some View {
		switch family {
		case .systemSmall:
			smallBody
		case .systemMedium:
			mediumBody
		default:
			smallBody
		}
	}

	private var smallBody: some View {
		VStack(alignment: .leading, spacing: 6) {
			Text("Fulcrum")
				.font(.caption)
				.foregroundStyle(.secondary)
			if let timer = entry.state.primaryTimer {
				Text(timer.label.isEmpty ? shortNote(timer.notePath) : timer.label)
					.font(.headline)
					.lineLimit(2)
				Text(timer.startDate, style: .timer)
					.font(.title2.monospacedDigit())
			} else {
				Text("No active timer")
					.font(.headline)
			}
		}
		.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
	}

	private var mediumBody: some View {
		HStack(alignment: .top, spacing: 12) {
			smallBody
			if entry.state.bridge.activeTimers.count > 1 {
				VStack(alignment: .leading, spacing: 4) {
					Text("+\(entry.state.bridge.activeTimers.count - 1) more")
						.font(.caption)
						.foregroundStyle(.secondary)
				}
			}
		}
	}

	private func shortNote(_ path: String) -> String {
		(path as NSString).lastPathComponent.replacingOccurrences(of: ".md", with: "")
	}
}

struct ActiveTimerWidget: Widget {
	let kind = "FulcrumActiveTimer"

	var body: some WidgetConfiguration {
		StaticConfiguration(kind: kind, provider: ActiveTimerProvider()) { entry in
			ActiveTimerWidgetView(entry: entry)
				.containerBackground(.fill.tertiary, for: .widget)
		}
		.configurationDisplayName("Active timer")
		.description("Shows your running Fulcrum timer.")
		.supportedFamilies([.systemSmall, .systemMedium])
	}
}
