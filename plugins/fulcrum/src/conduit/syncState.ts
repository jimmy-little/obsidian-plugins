import type {ConduitSyncState} from "./types";

export const CONDUIT_SYNC_DATA_KEY = "conduitSync";

export function emptySyncState(): ConduitSyncState {
	return {
		lastCompletedAt: null,
		lastRemindersFingerprint: "",
		lastVaultFingerprint: "",
		entities: {},
	};
}

export async function loadConduitSyncState(
	loadData: () => Promise<unknown>,
): Promise<ConduitSyncState> {
	const raw = (await loadData()) as Record<string, unknown> | null;
	const block = raw?.[CONDUIT_SYNC_DATA_KEY];
	if (!block || typeof block !== "object") return emptySyncState();
	const s = block as ConduitSyncState;
	return {
		lastCompletedAt: s.lastCompletedAt ?? null,
		lastRemindersFingerprint: s.lastRemindersFingerprint ?? "",
		lastVaultFingerprint: s.lastVaultFingerprint ?? "",
		entities: s.entities && typeof s.entities === "object" ? s.entities : {},
	};
}

export async function saveConduitSyncState(
	loadData: () => Promise<unknown>,
	saveData: (data: unknown) => Promise<void>,
	state: ConduitSyncState,
): Promise<void> {
	const raw = ((await loadData()) as Record<string, unknown> | null) ?? {};
	raw[CONDUIT_SYNC_DATA_KEY] = state;
	await saveData(raw);
}
