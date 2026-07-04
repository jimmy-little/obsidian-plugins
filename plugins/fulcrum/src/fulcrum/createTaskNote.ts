import {normalizePath, Notice, TFile, type App} from "obsidian";
import {updateTaskNoteField} from "./kanban/taskFieldUpdate";
import {renameRecurringTaskNoteIfNeeded} from "./recurrence/recurringTaskRename";
import type {FulcrumSettings} from "./settingsDefaults";
import {parseList} from "./settingsDefaults";
import {expandDateTokensInString, slugifyForFilename} from "./projectNewNoteFromTemplate";
import {parseFolderPathList} from "./utils/folderScopes";
import type {IndexedTask, RecurrenceAnchorMode, TaskReminderSpec} from "./types";

export interface CreateTaskNoteOptions {
	title: string;
	status?: string;
	priority?: string;
	dueDate?: string | null;
	scheduledDate?: string | null;
	/** Wikilink strings e.g. `[[Project]]` */
	projectLinks?: string[];
	/** Parent task wikilink for subtasks (stored in projects field). */
	parentTaskLink?: string | null;
	tags?: string[];
	areaLink?: string | null;
	/** Apple Reminders numeric id (legacy Conduit import — no longer written). */
	reminderId?: number;
	recurrence?: string | null;
	recurrenceAnchor?: RecurrenceAnchorMode;
	reminders?: TaskReminderSpec[];
	/** Markdown body content below frontmatter. */
	bodyContent?: string;
}

function sanitizeTitleForFilename(title: string): string {
	return title
		.trim()
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
		.replace(/\s+/g, " ")
		.slice(0, 120);
}

function resolveTaskNoteFolder(settings: FulcrumSettings): string {
	const explicit = settings.taskNoteDefaultFolder.trim();
	if (explicit) return explicit.replace(/\/+$/, "");
	const roots = parseFolderPathList(settings.taskNotesFolderPaths);
	if (roots.length > 0) return roots[0]!.replace(/\/+$/, "");
	return "35 Tasks/TaskNotes";
}

function buildFilename(settings: FulcrumSettings, title: string): string {
	const pattern = settings.taskNoteFilenamePattern.trim() || "{{title}}";
	const slug = slugifyForFilename(title);
	let name = expandDateTokensInString(pattern.replace(/\{\{title\}\}/g, slug));
	name = sanitizeTitleForFilename(name) || slug || "task";
	if (!name.toLowerCase().endsWith(".md")) name += ".md";
	return name;
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
	const norm = normalizePath(folderPath);
	if (!norm || app.vault.getAbstractFileByPath(norm)) return;
	const parts = norm.split("/");
	let acc = "";
	for (const part of parts) {
		acc = acc ? `${acc}/${part}` : part;
		if (!app.vault.getAbstractFileByPath(acc)) {
			await app.vault.createFolder(acc);
		}
	}
}

function uniquePath(app: App, folder: string, basename: string): string {
	let path = normalizePath(`${folder}/${basename}`);
	if (!app.vault.getAbstractFileByPath(path)) return path;
	const stem = basename.replace(/\.md$/i, "");
	let n = 2;
	while (app.vault.getAbstractFileByPath(path)) {
		path = normalizePath(`${folder}/${stem} ${n}.md`);
		n++;
	}
	return path;
}

export async function createTaskNoteFile(
	app: App,
	settings: FulcrumSettings,
	opts: CreateTaskNoteOptions,
): Promise<TFile | null> {
	const title = opts.title.trim();
	if (!title) {
		new Notice("Enter a task title.");
		return null;
	}

	const folder = resolveTaskNoteFolder(settings);
	await ensureFolder(app, folder);
	const filename = buildFilename(settings, title);
	const path = uniquePath(app, folder, filename);

	const openStatus = parseList(settings.taskStatuses)[0] ?? "todo";
	const status = opts.status?.trim() || openStatus;
	const typeField = settings.typeField.trim() || "type";
	const tag = settings.taskTag.trim() || "task";
	const tags = opts.tags?.length ? opts.tags : [tag];

	const fm: Record<string, unknown> = {
		[typeField]: "task",
		[settings.taskTitleField]: title,
		[settings.taskStatusField]: status,
		tags,
	};

	if (opts.priority?.trim()) {
		fm[settings.taskPriorityField] = opts.priority.trim();
	}
	if (opts.dueDate) fm[settings.taskDueDateField] = opts.dueDate;
	if (opts.scheduledDate) fm[settings.taskScheduledDateField] = opts.scheduledDate;
	if (opts.areaLink) fm[settings.areaLinkField] = opts.areaLink;
	if (opts.recurrence?.trim()) {
		fm[settings.taskRecurrenceField.trim() || "recurrence"] = opts.recurrence.trim();
		if (opts.recurrenceAnchor) {
			fm[settings.taskRecurrenceAnchorField.trim() || "recurrence_anchor"] = opts.recurrenceAnchor;
		}
	}
	if (opts.reminders?.length) {
		fm[settings.taskRemindersField.trim() || "reminders"] = opts.reminders;
	}

	const projectLinks: string[] = [];
	if (opts.parentTaskLink?.trim()) projectLinks.push(opts.parentTaskLink.trim());
	for (const pl of opts.projectLinks ?? []) {
		const t = pl.trim();
		if (t && !projectLinks.includes(t)) projectLinks.push(t);
	}
	if (projectLinks.length === 1) {
		fm[settings.projectLinkField] = projectLinks[0];
	} else if (projectLinks.length > 1) {
		fm[settings.taskProjectsField] = projectLinks;
	}

	const fmLines = ["---"];
	for (const [k, v] of Object.entries(fm)) {
		if (Array.isArray(v)) {
			fmLines.push(`${k}:`);
			for (const item of v) fmLines.push(`  - ${JSON.stringify(item)}`);
		} else if (typeof v === "string") {
			fmLines.push(`${k}: ${JSON.stringify(v)}`);
		} else {
			fmLines.push(`${k}: ${v}`);
		}
	}
	fmLines.push("---", "");

	let body = fmLines.join("\n");
	const notesBody = opts.bodyContent?.trim() ?? "";
	const templatePath = settings.taskNoteBodyTemplatePath.trim();
	if (templatePath) {
		const tf = app.vault.getAbstractFileByPath(templatePath);
		if (tf instanceof TFile) {
			const tpl = await app.vault.read(tf);
			const expanded = expandDateTokensInString(tpl)
				.replace(/\{\{title\}\}/g, title)
				.replace(/\{\{status\}\}/g, status)
				.replace(/\{\{priority\}\}/g, opts.priority ?? "");
			if (expanded.trim()) {
				body = fmLines.join("\n") + "\n" + expanded;
			}
		}
	}
	if (notesBody) {
		body = body.trimEnd() + (body.endsWith("\n") ? "" : "\n") + "\n" + notesBody + "\n";
	}

	try {
		const file = await app.vault.create(path, body);
		return file;
	} catch (e) {
		console.error(e);
		new Notice("Could not create task note.");
		return null;
	}
}

export function extractMarkdownBody(content: string): string {
	const m = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	return m ? content.slice(m[0].length).trim() : content.trim();
}

export async function replaceTaskNoteBody(app: App, file: TFile, body: string): Promise<void> {
	const raw = await app.vault.read(file);
	const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	if (!m) {
		await app.vault.modify(file, body.trim() ? `${body.trim()}\n` : "");
		return;
	}
	const tail = body.trim() ? `\n${body.trim()}\n` : "\n";
	await app.vault.modify(file, m[0] + tail);
}

export async function saveTaskNoteEdit(
	app: App,
	settings: FulcrumSettings,
	task: IndexedTask,
	opts: CreateTaskNoteOptions,
	projectPath: string | null,
): Promise<boolean> {
	if (task.source !== "taskNote") return false;
	const title = opts.title.trim();
	if (!title) {
		new Notice("Enter a task title.");
		return false;
	}

	const recKey = settings.taskRecurrenceField.trim() || "recurrence";
	const anchorKey = settings.taskRecurrenceAnchorField.trim() || "recurrence_anchor";
	const remindersKey = settings.taskRemindersField.trim() || "reminders";
	const projectsField = settings.taskProjectsField.trim();
	const recurrenceRule = opts.recurrence?.trim() || null;
	const hadRecurrence = !!task.recurrence?.trim();

	let projectLink: string | null = null;
	if (projectPath) {
		const pf = app.vault.getAbstractFileByPath(projectPath);
		if (pf instanceof TFile) {
			const lt =
				app.metadataCache.fileToLinktext(pf, pf.path, false) ??
				pf.basename.replace(/\.md$/i, "");
			projectLink = lt.startsWith("[[") ? lt : `[[${lt}]]`;
		}
	}

	const patch: Record<string, unknown> = {
		[settings.taskTitleField]: title,
		[settings.taskStatusField]: opts.status?.trim() || parseList(settings.taskStatuses)[0] || "todo",
		[settings.taskPriorityField]: opts.priority?.trim() || null,
		[settings.taskDueDateField]: opts.dueDate || null,
		[settings.taskScheduledDateField]: opts.scheduledDate || null,
		[settings.projectLinkField]: projectLink,
		[recKey]: recurrenceRule,
		[anchorKey]: recurrenceRule ? opts.recurrenceAnchor ?? null : null,
		[remindersKey]: opts.reminders?.length ? opts.reminders : null,
	};
	if (projectsField) patch[projectsField] = null;

	try {
		await updateTaskNoteField(app, task, settings, patch);
		await renameRecurringTaskNoteIfNeeded(app, task.file, hadRecurrence, recurrenceRule);
		await replaceTaskNoteBody(app, task.file, opts.bodyContent ?? "");
		return true;
	} catch (e) {
		console.error(e);
		new Notice("Could not save task note.");
		return false;
	}
}
