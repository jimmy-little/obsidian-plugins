import type {App} from "obsidian";
import type {ConduitSyncState} from "../conduit/types";
import type {EntryCache} from "../timer/types";

/** Keep plugin data.json bounded so Obsidian can load/save it reliably. */
export const MAX_TIMER_ENTRY_CACHE_FILES = 2000;
export const MAX_CONDUIT_SYNC_ENTITIES = 8000;

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

function vaultPathFromConduitKey(key: string): string | null {
	if (key.startsWith("task:")) {
		const rest = key.slice("task:".length);
		const lineSep = rest.lastIndexOf(":");
		if (lineSep > 0) {
			const maybeLine = rest.slice(lineSep + 1);
			if (/^\d+$/.test(maybeLine)) return rest.slice(0, lineSep);
		}
		return rest;
	}
	if (key.startsWith("project:")) return key.slice("project:".length);
	return null;
}

export function pruneConduitSyncState(
	app: App,
	state: ConduitSyncState,
	maxEntities = MAX_CONDUIT_SYNC_ENTITIES,
): ConduitSyncState {
	const entries = Object.entries(state.entities);
	if (entries.length === 0) return state;

	const kept: Record<string, (typeof entries)[0][1]> = {};
	for (const [key, entity] of entries) {
		const path = vaultPathFromConduitKey(key);
		if (path && !app.vault.getAbstractFileByPath(path)) continue;
		kept[key] = entity;
	}

	let keys = Object.keys(kept);
	if (keys.length > maxEntities) {
		keys = keys.slice(keys.length - maxEntities);
		const capped: typeof kept = {};
		for (const k of keys) capped[k] = kept[k]!;
		return {...state, entities: capped};
	}
	return {...state, entities: kept};
}

/** Drop duplicate legacy keys before writing data.json. */
export function buildPluginPersistedPayload(
	settings: Record<string, unknown>,
	timerEntryCache: EntryCache,
	conduitSync?: ConduitSyncState,
): Record<string, unknown> {
	const payload: Record<string, unknown> = {
		...settings,
		timerEntryCache: pruneTimerEntryCache(timerEntryCache),
	};
	delete payload.entryCache;
	if (conduitSync) {
		payload.conduitSync = conduitSync;
	}
	return payload;
}
