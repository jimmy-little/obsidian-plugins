import type {App} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import {parseList} from "./settingsDefaults";
import type {IndexedTask} from "./types";
import {flipMarkdownCheckboxLine} from "./utils/inlineTasks";

export async function toggleTaskNoteFrontmatter(
	app: App,
	task: IndexedTask,
	s: FulcrumSettings,
): Promise<void> {
	const done = new Set(parseList(s.taskDoneStatuses));
	const isDone = done.has(task.status);
	await app.fileManager.processFrontMatter(task.file, (fm: Record<string, unknown>) => {
		if (isDone) {
			fm[s.taskStatusField] = s.taskNoteYamlStatusOpen;
			delete fm[s.taskCompletedDateField];
		} else {
			fm[s.taskStatusField] = s.taskNoteYamlStatusDone;
			fm[s.taskCompletedDateField] = new Date().toISOString().slice(0, 10);
		}
	});
}

export async function toggleInlineTaskLine(app: App, task: IndexedTask): Promise<void> {
	if (task.line == null) return;
	const lines = (await app.vault.read(task.file)).split("\n");
	const line = lines[task.line];
	if (line === undefined) return;
	const next = flipMarkdownCheckboxLine(line);
	if (next == null) return;
	lines[task.line] = next;
	await app.vault.modify(task.file, lines.join("\n"));
}
