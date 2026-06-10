import type {App} from "obsidian";
import {TFile} from "obsidian";
import {pruneConduitSyncState} from "../fulcrum/pluginDataPrune";
import type {ConduitSyncState} from "./types";
import type FulcrumPlugin from "../main";

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
	app: App,
	loadData: () => Promise<unknown>,
	saveData: (data: unknown) => Promise<void>,
	state: ConduitSyncState,
): Promise<void> {
	const raw = ((await loadData()) as Record<string, unknown> | null) ?? {};
	raw[CONDUIT_SYNC_DATA_KEY] = pruneConduitSyncState(app, state);
	await saveData(raw);
}

/**
 * Nuke all Conduit sync state: plugin data entities + frontmatter fields on tasks and projects.
 * Reminders lists in Apple Reminders are not deleted. Returns the number of frontmatter fields cleared.
 */
export async function resetConduitSyncDatabase(plugin: FulcrumPlugin): Promise<number> {
	const app = plugin.app;
	const settings = plugin.settings;

	// 1. Clear plugin-level sync state
	const raw = ((await plugin.loadData()) as Record<string, unknown> | null) ?? {};
	raw[CONDUIT_SYNC_DATA_KEY] = emptySyncState();
	await plugin.saveData(raw);

	// 2. Strip frontmatter fields from vault files
	const reminderIdKey = settings.conduitReminderIdField.trim() || "appleReminderId";
	const listIdKey = settings.conduitReminderListIdField.trim() || "appleReminderListId";
	const syncKey = settings.conduitSyncField.trim() || "conduitSync";
	const archivedKey = settings.conduitListArchivedField.trim() || "conduitListArchived";

	let cleared = 0;
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		if (!fm) continue;

		const hasReminderId = fm[reminderIdKey] != null;
		const hasListId = fm[listIdKey] != null;
		const hasSync = fm[syncKey] != null;
		const hasArchived = fm[archivedKey] != null;

		if (!hasReminderId && !hasListId && !hasSync && !hasArchived) continue;

		await app.fileManager.processFrontMatter(file, (fmObj) => {
			if (fmObj[reminderIdKey] != null) {
				delete fmObj[reminderIdKey];
				cleared++;
			}
			if (fmObj[listIdKey] != null) {
				delete fmObj[listIdKey];
				cleared++;
			}
			if (fmObj[syncKey] != null) {
				delete fmObj[syncKey];
				cleared++;
			}
			if (fmObj[archivedKey] != null) {
				delete fmObj[archivedKey];
				cleared++;
			}
		});
	}

	// 3. Also strip inline reminder-id HTML comments from task lines
	const commentRe = /\s*<!--\s*reminder-id:\s*\d+\s*-->/gi;
	for (const file of app.vault.getMarkdownFiles()) {
		const content = await app.vault.cachedRead(file);
		if (!commentRe.test(content)) continue;
		commentRe.lastIndex = 0;
		const cleaned = content.replace(commentRe, "");
		if (cleaned !== content) {
			await app.vault.modify(file, cleaned);
			cleared++;
		}
	}

	// 4. Rebuild the index so subsequent syncs start fresh
	await plugin.vaultIndex.rebuild();

	return cleared;
}
