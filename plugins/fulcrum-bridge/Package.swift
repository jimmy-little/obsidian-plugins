// swift-tools-version: 5.9
import PackageDescription

let package = Package(
	name: "FulcrumBridge",
	platforms: [.macOS(.v14)],
	dependencies: [
		.package(url: "https://github.com/swhitty/FlyingFox", from: "0.9.0"),
	],
	targets: [
		.executableTarget(
			name: "FulcrumBridge",
			dependencies: [
				.product(name: "FlyingFox", package: "FlyingFox"),
			],
			path: "Sources/FulcrumBridge",
			exclude: ["Info.plist"],
			linkerSettings: [
				.unsafeFlags([
					"-Xlinker", "-sectcreate",
					"-Xlinker", "__TEXT",
					"-Xlinker", "__info_plist",
					"-Xlinker", "Sources/FulcrumBridge/Info.plist",
				]),
			]
		),
	]
)
