import AppKit

@main
enum FulcrumBridgeLauncher {
	static func main() {
		let app = NSApplication.shared
		let delegate = AppDelegate()
		app.delegate = delegate
		app.run()
	}
}
