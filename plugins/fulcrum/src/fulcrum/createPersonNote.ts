import {normalizePath, Notice, TFile, type App} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";

function sanitizeTitleForFilename(title: string): string {
	return title
		.trim()
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
		.replace(/\s+/g, " ")
		.slice(0, 120);
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

function resolvePeopleFolder(settings: FulcrumSettings): string {
	const folder = settings.peopleFolder.trim();
	return folder ? normalizePath(folder) : "People";
}

/** Create a people-folder note from a ghost wikilink and open it in a new tab. */
export async function createPersonNoteFile(
	app: App,
	settings: FulcrumSettings,
	opts: {linkText: string; displayName: string},
): Promise<TFile | null> {
	const displayName = opts.displayName.trim() || opts.linkText.trim();
	if (!displayName) {
		new Notice("Enter a person name.");
		return null;
	}

	const folder = resolvePeopleFolder(settings);
	await ensureFolder(app, folder);
	const filenameStem =
		sanitizeTitleForFilename(displayName) || sanitizeTitleForFilename(opts.linkText);
	const filename = `${filenameStem || "person"}.md`;
	const path = uniquePath(app, folder, filename);

	const body = `---\nname: ${JSON.stringify(displayName)}\n---\n`;
	let file: TFile;
	try {
		file = await app.vault.create(path, body);
	} catch (e) {
		console.error(e);
		new Notice("Could not create person note.");
		return null;
	}

	const leaf = app.workspace.getLeaf("tab");
	await leaf.openFile(file);
	new Notice(`Created ${displayName}`);
	return file;
}
