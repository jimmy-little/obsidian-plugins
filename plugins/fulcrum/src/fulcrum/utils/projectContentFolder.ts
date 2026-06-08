import type {App} from "obsidian";
import {TFile, TFolder} from "obsidian";
import {getSameNamedProjectFolder} from "../projectMove";

export type ProjectFolderEntry = {
	path: string;
	name: string;
	extension: string;
	folderPath: string;
	modifiedMs: number;
};

/** Project content root: same-named folder when present, else parent of the project note. */
export function resolveProjectContentFolder(app: App, projectPath: string): TFolder | null {
	const file = app.vault.getAbstractFileByPath(projectPath);
	if (!(file instanceof TFile)) return null;
	const named = getSameNamedProjectFolder(file);
	if (named) return named;
	const parent = file.parent;
	return parent instanceof TFolder ? parent : null;
}

export function listProjectFolderEntries(folder: TFolder): ProjectFolderEntry[] {
	const out: ProjectFolderEntry[] = [];
	const walk = (dir: TFolder, prefix: string): void => {
		for (const child of dir.children) {
			if (child instanceof TFolder) {
				walk(child, prefix ? `${prefix}/${child.name}` : child.name);
				continue;
			}
			if (!(child instanceof TFile)) continue;
			out.push({
				path: child.path,
				name: child.name,
				extension: child.extension,
				folderPath: prefix,
				modifiedMs: child.stat.mtime,
			});
		}
	};
	walk(folder, "");
	out.sort((a, b) => {
		const folderCmp = a.folderPath.localeCompare(b.folderPath);
		if (folderCmp !== 0) return folderCmp;
		return a.name.localeCompare(b.name);
	});
	return out;
}
