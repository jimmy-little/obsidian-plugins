import type {App, TFile, Vault} from "obsidian";
import {normalizePath, TFolder} from "obsidian";

/** Compare project note basename to folder name (case/spacing insensitive). */
export function projectNameKey(name: string): string {
	return name
		.replace(/\.md$/i, "")
		.trim()
		.toLowerCase()
		.replace(/[\s_.-]+/g, "");
}

export function projectFolderMatchesProjectFile(folder: TFolder, file: TFile): boolean {
	return projectNameKey(folder.name) === projectNameKey(file.basename);
}

/**
 * When the project note lives in a folder named like the project (e.g. `MyProject/My Project.md`),
 * return that folder so the whole directory can move together.
 */
export function getSameNamedProjectFolder(projectFile: TFile): TFolder | null {
	const parent = projectFile.parent;
	if (!(parent instanceof TFolder)) return null;
	if (!projectFolderMatchesProjectFile(parent, projectFile)) return null;
	return parent;
}

export function uniqueFolderPathInParent(
	vault: Vault,
	parentDir: string,
	folderName: string,
): string {
	const normParent = normalizePath(parentDir);
	const base = normalizePath(`${normParent}/${folderName}`);
	if (!vault.getAbstractFileByPath(base)) return base;
	let n = 1;
	for (;;) {
		const p = normalizePath(`${normParent}/${folderName} (${n})`);
		if (!vault.getAbstractFileByPath(p)) return p;
		n += 1;
	}
}

export async function moveProjectFileToDir(
	app: App,
	projectFile: TFile,
	destDir: string,
): Promise<string> {
	const normDir = normalizePath(destDir);
	const newPath = uniqueFilePathInDir(app.vault, normDir, projectFile.name);
	if (normalizePath(projectFile.path) === normalizePath(newPath)) return projectFile.path;
	await app.fileManager.renameFile(projectFile, newPath);
	return newPath;
}

export async function moveProjectFolderToParent(
	app: App,
	folder: TFolder,
	destParentDir: string,
): Promise<string> {
	const normParent = normalizePath(destParentDir);
	const newFolderPath = uniqueFolderPathInParent(app.vault, normParent, folder.name);
	if (normalizePath(folder.path) === normalizePath(newFolderPath)) return folder.path;
	await app.fileManager.renameFile(folder, newFolderPath);
	return newFolderPath;
}

function uniqueFilePathInDir(vault: Vault, dir: string, fileName: string): string {
	const base = normalizePath(`${dir}/${fileName}`);
	if (!vault.getAbstractFileByPath(base)) return base;
	const stem = fileName.replace(/\.md$/i, "");
	let n = 1;
	for (;;) {
		const p = normalizePath(`${dir}/${stem} (${n}).md`);
		if (!vault.getAbstractFileByPath(p)) return p;
		n += 1;
	}
}
