import {normalizePath, Notice, TFile, type App} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import {parseList} from "./settingsDefaults";
import {expandDateTokensInString, slugifyForFilename} from "./projectNewNoteFromTemplate";
import {parseFolderPathList} from "./utils/folderScopes";

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
	/** Apple Reminders numeric id (Conduit import). */
	reminderId?: number;
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
	if (opts.reminderId != null) {
		const key = settings.conduitReminderIdField.trim() || "appleReminderId";
		fm[key] = opts.reminderId;
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

	try {
		const file = await app.vault.create(path, body);
		return file;
	} catch (e) {
		console.error(e);
		new Notice("Could not create task note.");
		return null;
	}
}
