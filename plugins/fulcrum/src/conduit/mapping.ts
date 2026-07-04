import type {App} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {IndexedProject} from "../fulcrum/types";

export function readProjectListId(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
): string | null {
	const cache = app.metadataCache.getFileCache(project.file);
	const fm = cache?.frontmatter as Record<string, unknown> | undefined;
	const key = settings.conduitReminderListIdField.trim() || "appleReminderListId";
	const v = fm?.[key];
	return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
}

export async function writeProjectListId(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
	listId: string | null,
): Promise<void> {
	const key = settings.conduitReminderListIdField.trim() || "appleReminderListId";
	await app.fileManager.processFrontMatter(project.file, (fm) => {
		if (listId) fm[key] = listId;
		else delete fm[key];
	});
}
