import type {EntryCache} from "../timer/types";

/** Keep plugin data.json bounded so Obsidian can load/save it reliably. */
export const MAX_TIMER_ENTRY_CACHE_FILES = 2000;

export function pruneTimerEntryCache(
	cache: EntryCache,
	maxEntries = MAX_TIMER_ENTRY_CACHE_FILES,
): EntryCache {
	const keys = Object.keys(cache);
	if (keys.length <= maxEntries) return cache;
	const sorted = keys.sort(
		(a, b) => (cache[b]?.lastModified ?? 0) - (cache[a]?.lastModified ?? 0),
	);
	const out: EntryCache = {};
	for (const k of sorted.slice(0, maxEntries)) {
		out[k] = cache[k]!;
	}
	return out;
}

/** Drop duplicate legacy keys before writing data.json. */
export function buildPluginPersistedPayload(
	settings: Record<string, unknown>,
	timerEntryCache: EntryCache,
): Record<string, unknown> {
	const payload: Record<string, unknown> = {
		...settings,
		timerEntryCache: pruneTimerEntryCache(timerEntryCache),
	};
	delete payload.entryCache;
	delete payload.conduitSync;
	delete payload.conduitEntityState;
	delete payload.conduitSyncOverrides;
	delete payload.conduitProjectListPairs;
	delete payload.conduitImportUnmapped;
	return payload;
}
