import type {App} from "obsidian";
import type {FulcrumSettings} from "../settingsDefaults";
import {fileMatchesFolderScope, parseFolderPathList} from "./folderScopes";
import type {IndexedTask} from "../types";

function fmString(fm: Record<string, unknown>, key: string): string | undefined {
	const v = fm[key];
	if (v == null) return undefined;
	if (typeof v === "string") return v.trim() || undefined;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return undefined;
}

export function tagsIncludeTask(fm: Record<string, unknown>, tag: string): boolean {
	const t = fm.tags;
	const want = tag.toLowerCase().replace(/^#/, "");
	if (Array.isArray(t)) {
		return t.some((x) => String(x).toLowerCase().replace(/^#/, "") === want);
	}
	if (typeof t === "string") {
		return t
			.split(/[\s,]+/)
			.map((s) => s.replace(/^#/, "").toLowerCase())
			.includes(want);
	}
	return false;
}

/** Whether frontmatter identifies a dedicated task note. */
export function isTaskNoteFile(
	fm: Record<string, unknown> | undefined,
	settings: FulcrumSettings,
): boolean {
	if (!fm) return false;
	const typeField = settings.typeField.trim() || "type";
	const tVal = fmString(fm, typeField)?.toLowerCase();
	return tagsIncludeTask(fm, settings.taskTag) || tVal === "task";
}

/** Inline checklist lines inside a task note (subtasks, not separate Reminders). */
export function isInlineTaskInTaskNoteFile(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
): boolean {
	if (task.source !== "inline") return false;
	const taskNoteRoots = parseFolderPathList(settings.taskNotesFolderPaths);
	if (!fileMatchesFolderScope(task.file.path, taskNoteRoots)) return false;
	const fm = app.metadataCache.getFileCache(task.file)?.frontmatter as
		| Record<string, unknown>
		| undefined;
	return isTaskNoteFile(fm, settings);
}
