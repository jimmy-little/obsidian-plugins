import type {App, TFile} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import {parseList} from "../fulcrum/settingsDefaults";
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
import {SNAPSHOT_FOOTER} from "../fulcrum/projectArchive";

function splitReminderDue(due: string | null): {dueDate?: string; scheduledDate?: string} {
	if (!due?.trim()) return {};
	const d = due.trim();
	if (/T\d/.test(d)) return {scheduledDate: d};
	if (/^\d{4}-\d{2}-\d{2}/.test(d)) return {dueDate: d.slice(0, 10)};
	return {dueDate: d};
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

const PROJECT_TASKS_HEADING = "## Project Tasks";

/**
 * Build an inline task line for a Reminder.
 * Format: `- [ ] Title [[ProjectName]] #task 📅 YYYY-MM-DD <!-- reminder-id: NNN -->`
 */
function buildInlineTaskLine(
	title: string,
	project: IndexedProject,
	dueDate: string | undefined,
	reminderId: number,
	includeTag: string,
): string {
	const projectName = project.name.trim() || project.file.basename.replace(/\.md$/i, "");
	const wikilink = `[[${projectName}]]`;
	const tag = includeTag ? `#${includeTag.replace(/^#/, "")}` : "#task";
	const due = dueDate ? ` 📅 ${dueDate}` : "";
	const comment = ` <!-- reminder-id: ${reminderId} -->`;
	return `- [ ] ${title.trim()} ${wikilink} ${tag}${due}${comment}`;
}

/**
 * Find the insertion point in the project file for new inline tasks.
 * Strategy:
 * 1. If a `## Project Tasks` heading exists, insert after its last task line (or after the heading).
 * 2. Otherwise, look for the snapshot end marker and insert below it.
 * 3. If neither exists, append a `## Project Tasks` heading at the end of the file.
 *
 * Returns the line index at which to insert new lines.
 */
function findTaskInsertionLine(lines: string[]): {insertAt: number; needsHeading: boolean} {
	const headingIdx = lines.findIndex(
		(l) => l.trim().toLowerCase() === PROJECT_TASKS_HEADING.toLowerCase(),
	);

	if (headingIdx !== -1) {
		// Find the last contiguous task line (or blank) after the heading
		let end = headingIdx + 1;
		for (let i = headingIdx + 1; i < lines.length; i++) {
			const trimmed = lines[i]!.trim();
			if (trimmed === "" || /^[-*+]\s*\[/.test(trimmed)) {
				end = i + 1;
			} else {
				break;
			}
		}
		return {insertAt: end, needsHeading: false};
	}

	// No heading — look for snapshot end marker and insert below it
	const snapshotEndIdx = lines.findIndex((l) => l.trim() === SNAPSHOT_FOOTER);
	if (snapshotEndIdx !== -1) {
		// Insert after the snapshot footer (skip one blank line if present)
		let insertAt = snapshotEndIdx + 1;
		if (insertAt < lines.length && lines[insertAt]!.trim() === "") insertAt++;
		return {insertAt, needsHeading: true};
	}

	// Neither found — append at end
	return {insertAt: lines.length, needsHeading: true};
}

/**
 * On explicit project pull/sync: import open Reminders on this project's list
 * that are not yet linked to any vault task. Creates inline tasks on the project page.
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

	if (candidates.length === 0) return 0;

	const includeTag = settings.inlineTaskIncludeTag.trim() || "task";
	const projectFile = project.file;
	const content = await app.vault.read(projectFile);
	const lines = content.split("\n");
	const {insertAt, needsHeading} = findTaskInsertionLine(lines);

	const newLines: string[] = [];
	if (needsHeading) {
		newLines.push("", PROJECT_TASKS_HEADING, "");
	}

	let imported = 0;
	const total = candidates.length;

	for (let i = 0; i < candidates.length; i++) {
		const row = candidates[i]!;
		onProgress?.(i + 1, total);

		const dates = splitReminderDue(row.dueDate);
		const taskLine = buildInlineTaskLine(
			row.title,
			project,
			dates.dueDate ?? dates.scheduledDate,
			row.numericId,
			includeTag,
		);
		newLines.push(taskLine);

		// Update the Reminder's notes with an obsidian:// link back to the project file
		const notes = formatReminderNotesBody(
			buildObsidianOpenLink(app, settings.conduitVaultNameOverride, projectFile.path),
		);
		const areaTag = settings.conduitSyncAreaTags ? areaTagForProject(project) : null;
		const tags = areaTag ? [areaTag] : undefined;
		try {
			await remctl.edit(row.numericId, {notes, tags});
		} catch (e) {
			console.warn("Conduit import: could not update Reminder notes", row.numericId, e);
		}

		imported++;
	}

	// Insert the new task lines into the file
	lines.splice(insertAt, 0, ...newLines);
	await app.vault.modify(projectFile, lines.join("\n"));

	// Record sync state for each imported task (line numbers are relative after insert)
	const baseLineOffset = insertAt + (needsHeading ? 3 : 0); // account for heading lines
	for (let i = 0; i < candidates.length; i++) {
		const row = candidates[i]!;
		const lineNo = baseLineOffset + i;
		const vaultKey = `task:${projectFile.path}:${lineNo}`;
		state.entities[vaultKey] = {
			vaultKey,
			reminderNumericId: row.numericId,
			projectPath: project.file.path,
			base: snapshotFromReminder(row, settings),
			vaultRevision: String(Date.now()),
			reminderRevision: row.lastModified || String(Date.now()),
			lastWriter: "reminders",
		};
	}

	return imported;
}
