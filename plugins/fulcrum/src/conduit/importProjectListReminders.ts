import type {App} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import {parseList} from "../fulcrum/settingsDefaults";
import {createTaskNoteFile} from "../fulcrum/createTaskNote";
import type {IndexedProject, IndexedTask} from "../fulcrum/types";
import {
	buildObsidianOpenLink,
	extractPathFromObsidianLink,
	formatReminderNotesBody,
	resolveVaultName,
} from "./deepLink";
import {readTaskReminderIdAsync} from "./mapping";
import {areaTagForProject} from "./projectMeta";
import type {RemctlClient} from "./remctlClient";
import type {ConduitSyncState, RemctlReminderRow} from "./types";
import {snapshotFromReminder} from "./taskSync";

function splitReminderDue(due: string | null): {dueDate?: string; scheduledDate?: string} {
	if (!due?.trim()) return {};
	const d = due.trim();
	if (/T\d/.test(d)) return {scheduledDate: d};
	if (/^\d{4}-\d{2}-\d{2}/.test(d)) return {dueDate: d.slice(0, 10)};
	return {dueDate: d};
}

function projectWikilink(project: IndexedProject): string {
	const name = project.name.trim() || project.file.basename.replace(/\.md$/i, "");
	return `[[${name}]]`;
}

function areaWikilink(project: IndexedProject): string | null {
	if (project.areaFile) {
		return `[[${project.areaFile.basename.replace(/\.md$/i, "")}]]`;
	}
	return null;
}

async function collectLinkedReminderIds(
	app: App,
	settings: FulcrumSettings,
	tasks: IndexedTask[],
	reminderRows: RemctlReminderRow[],
): Promise<Set<number>> {
	const ids = new Set<number>();
	for (const task of tasks) {
		const id = await readTaskReminderIdAsync(app, task, settings);
		if (id != null) ids.add(id);
	}
	const vaultName = resolveVaultName(app, settings.conduitVaultNameOverride);
	for (const row of reminderRows) {
		if (!row.notes.includes("obsidian://")) continue;
		const path = extractPathFromObsidianLink(row.notes, vaultName);
		if (path && app.vault.getAbstractFileByPath(path)) {
			ids.add(row.numericId);
		}
	}
	return ids;
}

/**
 * On explicit project pull/sync: create task notes for open Reminders on this project's list
 * that are not yet linked to any vault task.
 */
export async function importUnlinkedProjectReminders(
	app: App,
	remctl: RemctlClient,
	settings: FulcrumSettings,
	project: IndexedProject,
	listId: string,
	allVaultTasks: IndexedTask[],
	reminderRows: RemctlReminderRow[],
	state: ConduitSyncState,
	onProgress?: (current: number, total: number) => void,
): Promise<number> {
	const listRows = reminderRows.filter((row) => row.listId === listId);
	const linkedIds = await collectLinkedReminderIds(app, settings, allVaultTasks, listRows);
	const candidates = listRows.filter(
		(row) =>
			!row.completed &&
			!linkedIds.has(row.numericId) &&
			row.title.trim().length > 0,
	);

	let imported = 0;
	const total = candidates.length;
	const openStatus = parseList(settings.taskStatuses)[0] ?? "todo";

	for (let i = 0; i < candidates.length; i++) {
		const row = candidates[i]!;
		onProgress?.(i + 1, total);

		const dates = splitReminderDue(row.dueDate);
		const file = await createTaskNoteFile(app, settings, {
			title: row.title.trim(),
			status: openStatus,
			dueDate: dates.dueDate ?? null,
			scheduledDate: dates.scheduledDate ?? null,
			projectLinks: [projectWikilink(project)],
			areaLink: areaWikilink(project),
			reminderId: row.numericId,
		});
		if (!file) continue;

		const notes = formatReminderNotesBody(
			buildObsidianOpenLink(app, settings.conduitVaultNameOverride, file.path),
		);
		const areaTag = settings.conduitSyncAreaTags ? areaTagForProject(project) : null;
		const tags = areaTag ? [areaTag] : undefined;
		try {
			await remctl.edit(row.numericId, {notes, tags});
		} catch (e) {
			console.warn("Conduit import: could not update Reminder notes", row.numericId, e);
		}

		const vaultKey = `task:${file.path}`;
		state.entities[vaultKey] = {
			vaultKey,
			reminderNumericId: row.numericId,
			projectPath: project.file.path,
			base: snapshotFromReminder(row, settings),
			vaultRevision: String(file.stat.mtime),
			reminderRevision: row.lastModified || String(Date.now()),
			lastWriter: "reminders",
		};
		imported++;
	}

	return imported;
}
