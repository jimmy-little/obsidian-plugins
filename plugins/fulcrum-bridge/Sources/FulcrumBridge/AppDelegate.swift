import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
	private var statusItem: NSStatusItem!

	func applicationDidFinishLaunching(_ notification: Notification) {
		NSApp.setActivationPolicy(.accessory)
		setupMenuBar()
		BridgeServer.shared.start()
	}

	func applicationWillTerminate(_ notification: Notification) {
		BridgeServer.shared.stop()
	}

	private func setupMenuBar() {
		statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
		if let button = statusItem.button {
			let symbol =
				NSImage(systemSymbolName: "pyramid.fill", accessibilityDescription: "Fulcrum Bridge")
				?? NSImage(systemSymbolName: "triangle.fill", accessibilityDescription: "Fulcrum Bridge")
			if let symbol {
				symbol.isTemplate = true
				button.image = symbol
			}
			button.toolTip = "Fulcrum Bridge"
		}

		let menu = NSMenu()
		menu.addItem(menuItem("Health Check…", #selector(healthCheck)))
		menu.addItem(.separator())
		menu.addItem(menuItem("Restart Bridge", #selector(restartBridge)))
		menu.addItem(menuItem("Kill Bridge", #selector(killBridge)))
		statusItem.menu = menu
	}

	private func menuItem(_ title: String, _ action: Selector) -> NSMenuItem {
		let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
		item.target = self
		return item
	}

	@objc private func healthCheck() {
		Task {
			let summary = await HealthClient.fetchSummary()
			await MainActor.run {
				let alert = NSAlert()
				alert.messageText = "Fulcrum Bridge"
				alert.informativeText = summary
				alert.alertStyle = summary.contains("healthy") ? .informational : .warning
				alert.addButton(withTitle: "OK")
				alert.runModal()
			}
		}
	}

	@objc private func restartBridge() {
		BridgeServer.shared.restart()
		Task {
			try? await Task.sleep(nanoseconds: 800_000_000)
			let summary = await HealthClient.fetchSummary()
			await MainActor.run {
				let alert = NSAlert()
				alert.messageText = "Bridge Restarted"
				alert.informativeText = summary
				alert.addButton(withTitle: "OK")
				alert.runModal()
			}
		}
	}

	@objc private func killBridge() {
		BridgeServer.shared.stop()
		NSApp.terminate(nil)
	}
}
