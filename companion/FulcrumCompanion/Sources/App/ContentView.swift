import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
	@EnvironmentObject private var model: CompanionModel
	@State private var showFolderPicker = false

	var body: some View {
		NavigationStack {
			List {
				Section("Vault") {
					if model.vaultDisplayName.isEmpty {
						Text("Choose your Obsidian vault folder (iCloud or local).")
							.font(.subheadline)
							.foregroundStyle(.secondary)
					} else {
						LabeledContent("Folder", value: model.vaultDisplayName)
					}
					Button("Choose vault folder…") {
						showFolderPicker = true
					}
					Button {
						Task { await model.refresh() }
					} label: {
						if model.isRefreshing {
							Label("Refreshing…", systemImage: "arrow.clockwise")
						} else {
							Label("Refresh from vault", systemImage: "arrow.clockwise")
						}
					}
					.disabled(model.vaultDisplayName.isEmpty || model.isRefreshing)
				}

				if let error = model.errorMessage {
					Section {
						Text(error)
							.foregroundStyle(.red)
							.font(.footnote)
					}
				}

				activeTimersSection
				quickStartSection

				if let bridge = model.bridge, !bridge.pendingCommands.filter({ $0.processedAt == nil }).isEmpty {
					Section("Pending sync") {
						Text("Fulcrum in Obsidian applies these within a few seconds (keep Obsidian focused on this vault).")
							.font(.footnote)
							.foregroundStyle(.secondary)
						ForEach(bridge.pendingCommands.filter { $0.processedAt == nil }) { cmd in
							Text("\(cmd.op.rawValue) · \(cmd.createdAt)")
								.font(.caption)
						}
					}
				}
			}
			.navigationTitle("Fulcrum")
			.onAppear { model.loadFromCache() }
			.fileImporter(
				isPresented: $showFolderPicker,
				allowedContentTypes: [.folder],
				allowsMultipleSelection: false
			) { result in
				switch result {
				case .success(let urls):
					guard let url = urls.first else { return }
					#if os(macOS)
					_ = url.startAccessingSecurityScopedResource()
					#endif
					model.setVault(url: url)
				case .failure(let error):
					model.errorMessage = error.localizedDescription
				}
			}
		}
	}

	@ViewBuilder
	private var activeTimersSection: some View {
		Section {
			if let timers = model.bridge?.activeTimers, !timers.isEmpty {
				ForEach(timers) { timer in
					ActiveTimerRow(timer: timer) {
						Task { await model.stopTimer(timer) }
					}
				}
				Button(role: .destructive) {
					Task { await model.stopAll() }
				} label: {
					Label("Stop all", systemImage: "stop.fill")
				}
			} else {
				Text("No active timers")
					.foregroundStyle(.secondary)
			}
		} header: {
			Text("Active timers")
		} footer: {
			Text("Synced from Fulcrum when Obsidian publishes the bridge file.")
		}
	}

	@ViewBuilder
	private var quickStartSection: some View {
		Section("Quick start") {
			if let items = model.bridge?.quickStartItems, !items.isEmpty {
				ForEach(items.prefix(12)) { item in
					QuickStartRow(item: item, isRunning: model.isQuickStartRunning(item)) {
						Task { await model.toggleQuickStart(item) }
					}
				}
			} else {
				Text("No quick start buttons in bridge yet.")
					.foregroundStyle(.secondary)
			}
		}
	}
}

private struct QuickStartRow: View {
	let item: WidgetBridgeQuickStartItem
	let isRunning: Bool
	let onTap: () -> Void

	var body: some View {
		Button(action: onTap) {
			HStack {
				VStack(alignment: .leading, spacing: 2) {
					Text(item.label)
						.font(.body)
					Text(isRunning ? "Running — tap to stop" : item.kind)
						.font(.caption2)
						.foregroundStyle(isRunning ? .red : .secondary)
				}
				Spacer()
				if isRunning {
					Image(systemName: "stop.fill")
						.foregroundStyle(.red)
				}
			}
		}
	}
}

private struct ActiveTimerRow: View {
	let timer: WidgetBridgeActiveTimer
	let onStop: () -> Void

	var body: some View {
		HStack(alignment: .top) {
			VStack(alignment: .leading, spacing: 4) {
				Text(timer.label.isEmpty ? noteName : timer.label)
					.font(.headline)
				if let project = timer.project, !project.isEmpty {
					Text(project)
						.font(.caption)
						.foregroundStyle(.secondary)
				}
				Text(noteName)
					.font(.caption2)
					.foregroundStyle(.tertiary)
				Text(timer.startDate, style: .timer)
					.font(.title3.monospacedDigit())
			}
			Spacer()
			Button(action: onStop) {
				Image(systemName: "stop.fill")
					.foregroundStyle(.red)
			}
			.buttonStyle(.borderless)
			.accessibilityLabel("Stop timer")
		}
		.padding(.vertical, 4)
	}

	private var noteName: String {
		(timer.notePath as NSString).lastPathComponent.replacingOccurrences(of: ".md", with: "")
	}
}
