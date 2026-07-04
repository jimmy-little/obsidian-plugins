import {normalizePath, Notice, type App, TFile} from "obsidian";
import {recurringTaskBasename} from "./recurringTaskBasename";

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

/** Replace a leading YYYY-MM-DD in the basename with `Recurring-` when recurrence is first applied. */
export async function renameRecurringTaskNoteIfNeeded(
	app: App,
	file: TFile,
	hadRecurrence: boolean,
	newRecurrence: string | null,
): Promise<void> {
	if (hadRecurrence || !newRecurrence?.trim()) return;

	const newBasename = recurringTaskBasename(file.name);
	if (newBasename === file.name) return;

	const folder = file.parent?.path ?? "";
	const destPath = uniquePath(app, folder, newBasename);
	try {
		await app.vault.rename(file, destPath);
	} catch (e) {
		console.error(e);
		new Notice("Could not rename recurring task note.");
	}
}
