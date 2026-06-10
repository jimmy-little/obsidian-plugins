import type {App, TFile} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {IndexedProject, IndexedTask} from "../fulcrum/types";
import {
	parseObsidianTasksEmojiDates,
	setInlineTaskChecked,
	setInlineTaskDue,
} from "../fulcrum/utils/inlineTasks";
import {
	isDoneStatus,
	isProjectDone as isIndexedProjectDone,
	normalizeStatusKey,
	parseDoneStatusSet,
	parseList,
	parseTaskStatusChoices,
} from "../fulcrum/settingsDefaults";
import {applyTaskStatusChange, updateTaskNoteField} from "../fulcrum/kanban/taskFieldUpdate";

const REMINDER_ID_COMMENT = /<!--\s*reminder-id:\s*(\d+)\s*-->/i;

export async function readTaskReminderIdAsync(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
): Promise<number | null> {
	if (task.source === "taskNote") {
		const cache = app.metadataCache.getFileCache(task.file);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		const key = settings.conduitReminderIdField.trim() || "appleReminderId";
		return parseId(fm?.[key]);
	}
	if (task.line == null) return null;
	const content = await app.vault.read(task.file);
	const line = content.split("\n")[task.line];
	if (!line) return null;
	const m = line.match(REMINDER_ID_COMMENT);
	return m ? Number.parseInt(m[1], 10) : null;
}

export async function writeTaskReminderId(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	id: number | null,
): Promise<void> {
	if (task.source === "taskNote") {
		const key = settings.conduitReminderIdField.trim() || "appleReminderId";
		await updateTaskNoteField(app, task, settings, {
			[key]: id == null ? null : id,
		});
		return;
	}
	if (task.line == null) return;
	const lines = (await app.vault.read(task.file)).split("\n");
	const line = lines[task.line];
	if (line === undefined) return;
	let next = line.replace(REMINDER_ID_COMMENT, "").trimEnd();
	if (id != null) next = `${next} <!-- reminder-id: ${id} -->`;
	lines[task.line] = next;
	await app.vault.modify(task.file, lines.join("\n"));
}

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

export function readProjectConduitSync(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
): boolean {
	const cache = app.metadataCache.getFileCache(project.file);
	const fm = cache?.frontmatter as Record<string, unknown> | undefined;
	const key = settings.conduitSyncField.trim() || "conduitSync";
	return fm?.[key] === true;
}

export async function writeProjectConduitSync(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
	enabled: boolean,
): Promise<void> {
	const key = settings.conduitSyncField.trim() || "conduitSync";
	await app.fileManager.processFrontMatter(project.file, (fm) => {
		if (enabled) fm[key] = true;
		else delete fm[key];
	});
}

/** Third argument ignored; uses `project.file.path`. */
export function isProjectDone(
	project: IndexedProject,
	settings: FulcrumSettings,
	_projectPath?: string,
): boolean {
	return isIndexedProjectDone(project, settings);
}

export function taskIsDone(task: IndexedTask, settings: FulcrumSettings): boolean {
	const doneSet = parseDoneStatusSet(settings.taskDoneStatuses);
	if (isDoneStatus(task.status, doneSet)) return true;
	const yamlDone = settings.taskNoteYamlStatusDone.trim().toLowerCase();
	if (yamlDone && normalizeStatusKey(task.status) === yamlDone) return true;
	if (task.completedDate?.trim()) return true;
	return false;
}

/** Status string to write when marking a task note done via Conduit pull. */
export function conduitDoneStatusForTask(
	task: IndexedTask,
	settings: FulcrumSettings,
): string {
	if (task.source === "taskNote") {
		const yaml = settings.taskNoteYamlStatusDone.trim();
		if (yaml) return yaml;
	}
	return parseList(settings.taskDoneStatuses)[0] ?? "done";
}

export function conduitOpenStatusForTask(
	task: IndexedTask,
	settings: FulcrumSettings,
): string {
	if (task.source === "taskNote") {
		const yaml = settings.taskNoteYamlStatusOpen.trim();
		if (yaml) return yaml;
	}
	return parseTaskStatusChoices(settings)[0] ?? "todo";
}

export function vaultRevisionForTask(task: IndexedTask): string {
	return String(task.file.stat.mtime);
}

export async function applyConduitTaskPatch(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	patch: {title?: string; status?: string; dueDate?: string | null},
): Promise<void> {
	const doneSet = parseDoneStatusSet(settings.taskDoneStatuses);
	const openStatus = parseTaskStatusChoices(settings)[0] ?? "todo";
	const doneStatus = parseList(settings.taskDoneStatuses)[0] ?? "done";

	if (patch.status != null) {
		const target = patch.status;
		if (task.source === "taskNote") {
			await applyTaskStatusChange(app, task, settings, target);
		} else {
			if (isDoneStatus(target, doneSet)) await applyTaskStatusChange(app, task, settings, doneStatus);
			else if (normalizeStatusKey(target) === normalizeStatusKey(openStatus))
				await applyTaskStatusChange(app, task, settings, openStatus);
		}
	}

	if (patch.dueDate !== undefined) {
		if (task.source === "taskNote") {
			await updateTaskNoteField(app, task, settings, {
				[settings.taskDueDateField]: patch.dueDate,
			});
		} else if (task.line != null) {
			const lines = (await app.vault.read(task.file)).split("\n");
			const line = lines[task.line];
			if (line) {
				const next = setInlineTaskDue(line, patch.dueDate);
				if (next) {
					lines[task.line] = next;
					await app.vault.modify(task.file, lines.join("\n"));
				}
			}
		}
	}

	if (patch.title != null && patch.title !== task.title) {
		if (task.source === "taskNote") {
			await updateTaskNoteField(app, task, settings, {
				[settings.taskTitleField]: patch.title,
			});
		} else if (task.line != null) {
			const lines = (await app.vault.read(task.file)).split("\n");
			const line = lines[task.line];
			if (line) {
				const m = line.match(/^(\s*[-*+]\s*)\[([^\]]*)\](.*)$/);
				if (m) {
					const parsed = parseObsidianTasksEmojiDates(m[3] ?? "");
					const dues = parsed.dueDate ? ` 📅 ${parsed.dueDate}` : "";
					const sched = parsed.scheduledDate ? ` ⏳ ${parsed.scheduledDate}` : "";
					const body = `${patch.title}${dues}${sched}`.trim();
					lines[task.line] = `${m[1]}[${m[2]}] ${body}`;
					await app.vault.modify(task.file, lines.join("\n"));
				}
			}
		}
	}

}

function parseId(v: unknown): number | null {
	if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
	if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number.parseInt(v.trim(), 10);
	return null;
}
