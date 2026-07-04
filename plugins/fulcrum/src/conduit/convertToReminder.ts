import type {App} from "obsidian";
import {Notice, TFile} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import {parseList} from "../fulcrum/settingsDefaults";
import type {IndexedProject, IndexedTask} from "../fulcrum/types";
import {applyTaskStatusChange} from "../fulcrum/kanban/taskFieldUpdate";
import type {FulcrumHost} from "../fulcrum/pluginBridge";
import {
	inlineTaskPlainTitle,
	isInlineTaskLineChecked,
	parseCheckboxLineTitle,
	parseInlineTags,
	parseObsidianTasksEmojiDates,
} from "../fulcrum/utils/inlineTasks";
import {moveTaskNoteFile} from "../fulcrum/taskNoteActions";
import {readProjectListId} from "./mapping";
import {indexLists, resolveListForTask} from "./projectListSync";
import type {CreateReminderOptions, RemctlListRow} from "./types";
import type {RemindersBridge} from "./remindersBridge";

function resolveIndexedProject(
	host: FulcrumHost,
	projectFile: TFile | null,
): IndexedProject | null {
	if (!projectFile) return null;
	return host.vaultIndex.getSnapshot().projects.find((p) => p.file.path === projectFile.path) ?? null;
}

function dueForRemctl(iso: string | null | undefined): string | undefined {
	if (!iso?.trim()) return undefined;
	const d = iso.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
	if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(d)) return d.replace("T", " ").slice(0, 16);
	return d;
}

function resolveArchiveFolder(settings: FulcrumSettings): string {
	const raw = settings.taskNotesArchiveFolder.trim();
	return raw.replace(/\/+$/, "") || "35 Tasks/TaskNotes/Archive";
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
	if (!folderPath || app.vault.getAbstractFileByPath(folderPath)) return;
	const parts = folderPath.split("/").filter(Boolean);
	let acc = "";
	for (const part of parts) {
		acc = acc ? `${acc}/${part}` : part;
		if (!app.vault.getAbstractFileByPath(acc)) {
			await app.vault.createFolder(acc);
		}
	}
}

export function resolveReminderListRef(
	app: App,
	settings: FulcrumSettings,
	project: IndexedProject | null,
	lists: RemctlListRow[],
): {listId?: string; listName?: string} {
	const listIndex = indexLists(lists);
	if (project) {
		const listId = readProjectListId(app, project, settings);
		if (listId && listIndex.byId.has(listId)) return {listId};
	}
	return resolveListForTask(project, settings, app, listIndex);
}

function tagsForInlineLine(rawLine: string): string[] {
	const titleBare = parseCheckboxLineTitle(rawLine) ?? "";
	return parseInlineTags(titleBare).map((t) => t.replace(/^#/, ""));
}

function tagsForTask(task: IndexedTask): string[] {
	const fromTags = (task.tags ?? []).map((t) => t.replace(/^#/, ""));
	const fromInline = (task.inlineTags ?? []).map((t) => t.replace(/^#/, ""));
	return [...new Set([...fromTags, ...fromInline])].filter(Boolean);
}

async function markInlineConverted(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
): Promise<void> {
	if (task.source !== "inline" || task.line == null) return;
	const doneStatus = parseList(settings.taskDoneStatuses)[0] ?? "done";
	const lines = (await app.vault.read(task.file)).split("\n");
	const raw = lines[task.line] ?? "";
	const title = inlineTaskPlainTitle(raw) || task.title;
	const stamp = new Date().toISOString().slice(0, 10);
	const m = raw.match(/^(\s*[-*+]\s*)\[([^\]]*)\](.*)$/);
	if (m) {
		lines[task.line] = `${m[1]}[x] ${title} → Reminder (${stamp})`;
	} else {
		lines[task.line] = `- [x] ${title} → Reminder (${stamp})`;
	}
	await app.vault.modify(task.file, lines.join("\n"));
	if (!isInlineTaskLineChecked(raw)) {
		await applyTaskStatusChange(app, task, settings, doneStatus);
	}
}

async function readTaskNoteBody(app: App, file: TFile): Promise<string> {
	const content = await app.vault.read(file);
	const fmEnd = content.indexOf("---", 3);
	if (content.startsWith("---") && fmEnd > 0) {
		return content.slice(fmEnd + 3).trim();
	}
	return content.trim();
}

export async function convertInlineTaskToReminder(
	host: FulcrumHost,
	bridge: RemindersBridge,
	task: IndexedTask,
	lists: RemctlListRow[],
): Promise<boolean> {
	if (task.source !== "inline" || task.line == null) {
		new Notice("Only inline tasks can be converted to Reminders.");
		return false;
	}
	const content = await host.app.vault.read(task.file);
	const rawLine = content.split("\n")[task.line] ?? "";
	const title = inlineTaskPlainTitle(rawLine) || task.title;
	if (!title.trim()) {
		new Notice("Enter a task title before converting.");
		return false;
	}

	const listRef = resolveReminderListRef(
		host.app,
		host.settings,
		resolveIndexedProject(host, task.projectFile),
		lists,
	);
	if (!listRef.listId && !listRef.listName) {
		new Notice("No Reminders list configured. Set a project list or inbox list in settings.");
		return false;
	}

	const titleBare = parseCheckboxLineTitle(rawLine) ?? "";
	const {dueDate, scheduledDate} = parseObsidianTasksEmojiDates(titleBare);
	const due = dueForRemctl(dueDate ?? scheduledDate ?? task.dueDate ?? task.scheduledDate);
	const tags = tagsForInlineLine(rawLine);

	const opts: CreateReminderOptions = {
		title: title.trim(),
		...listRef,
		due: due ?? null,
		tags: tags.length > 0 ? tags : undefined,
	};

	try {
		await bridge.create(opts);
		await markInlineConverted(host.app, task, host.settings);
		await host.refreshIndex();
		new Notice(`Converted to Reminder: ${title}`);
		return true;
	} catch (e) {
		console.error(e);
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(msg.length < 120 ? msg : "Could not create Reminder.");
		return false;
	}
}

export async function convertTaskNoteToReminder(
	host: FulcrumHost,
	bridge: RemindersBridge,
	task: IndexedTask,
	lists: RemctlListRow[],
): Promise<boolean> {
	if (task.source !== "taskNote") {
		new Notice("Only task notes can use this action.");
		return false;
	}

	const listRef = resolveReminderListRef(
		host.app,
		host.settings,
		resolveIndexedProject(host, task.projectFile),
		lists,
	);
	if (!listRef.listId && !listRef.listName) {
		new Notice("No Reminders list configured. Set a project list or inbox list in settings.");
		return false;
	}

	const body = await readTaskNoteBody(host.app, task.file);
	const due = dueForRemctl(task.dueDate ?? task.scheduledDate);
	const tags = tagsForTask(task);
	const priority = task.priority?.trim();

	let notes = body;
	if (priority) notes = notes ? `${notes}\n\nPriority: ${priority}` : `Priority: ${priority}`;

	const opts: CreateReminderOptions = {
		title: task.title.trim() || task.file.basename.replace(/\.md$/i, ""),
		...listRef,
		due: due ?? null,
		notes: notes.trim() || undefined,
		tags: tags.length > 0 ? tags : undefined,
	};

	try {
		await bridge.create(opts);
		const doneStatus = parseList(host.settings.taskDoneStatuses)[0] ?? "done";
		await applyTaskStatusChange(host.app, task, host.settings, doneStatus);

		const archiveFolder = resolveArchiveFolder(host.settings);
		await ensureFolder(host.app, archiveFolder);
		await moveTaskNoteFile(host.app, task, archiveFolder);

		await host.refreshIndex();
		new Notice(`Converted to Reminder: ${task.title}`);
		return true;
	} catch (e) {
		console.error(e);
		const msg = e instanceof Error ? e.message : String(e);
		new Notice(msg.length < 120 ? msg : "Could not create Reminder.");
		return false;
	}
}
