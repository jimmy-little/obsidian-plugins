import Foundation

/// Security-scoped bookmark for the Obsidian vault root.
enum VaultAccess {
	static func resolveVaultURL() -> URL? {
		guard let bookmark = AppGroupStore.loadVaultBookmark() else { return nil }
		var stale = false
		#if os(macOS)
		guard let url = try? URL(
			resolvingBookmarkData: bookmark,
			options: .withSecurityScope,
			relativeTo: nil,
			bookmarkDataIsStale: &stale
		) else { return nil }
		#else
		guard let url = try? URL(
			resolvingBookmarkData: bookmark,
			options: [],
			relativeTo: nil,
			bookmarkDataIsStale: &stale
		) else { return nil }
		#endif
		if stale, let refreshed = try? url.bookmarkData() {
			AppGroupStore.saveVaultBookmark(refreshed)
		}
		return url
	}

	static func saveVaultBookmark(for url: URL) throws {
		#if os(macOS)
		let data = try url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
		#else
		let data = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
		#endif
		AppGroupStore.saveVaultBookmark(data)
	}

	@discardableResult
	static func withSecurityScope<T>(_ url: URL, _ work: () throws -> T) rethrows -> T {
		let accessed = url.startAccessingSecurityScopedResource()
		defer {
			if accessed { url.stopAccessingSecurityScopedResource() }
		}
		return try work()
	}
}
