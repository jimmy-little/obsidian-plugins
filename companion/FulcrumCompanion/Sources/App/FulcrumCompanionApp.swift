import SwiftUI

@main
struct FulcrumCompanionApp: App {
	@StateObject private var model = CompanionModel()

	var body: some Scene {
		WindowGroup {
			ContentView()
				.environmentObject(model)
		}
		#if os(macOS)
		.defaultSize(width: 420, height: 560)
		#endif
	}
}
