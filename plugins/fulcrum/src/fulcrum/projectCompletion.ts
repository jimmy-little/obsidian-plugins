import type {App, TFile, Vault} from "obsidian";
import {normalizePath, TFolder} from "obsidian";
import {
	getSameNamedProjectFolder,
	moveProjectFileToDir,
	moveProjectFolderToParent,
} from "./projectMove";
import {appendFulcrumProjectLog, formatFulcrumProjectLogLine} from "./projectNote";
import {parseList, resolveProjectsRoot, type FulcrumSettings} from "./settingsDefaults";
import {getImmediateSubfolderNames} from "./utils/paths";

/** Match Kanban / frontmatter status slug to an existing projects-root subfolder name. */
export function resolveStatusFolderName(
	vault: Vault,
	projectsRoot: string,
	statusSlug: string,
): string {
	const slug = statusSlug.trim().toLowerCase();
	if (!slug) return "active";
	const folders = getImmediateSubfolderNames(vault, projectsRoot);
	const match = folders.find((f) => f.toLowerCase() === slug);
	return match ?? statusSlug.trim();
}

export async function ensureFolderPath(vault: Vault, folderPath: string): Promise<void> {
	const norm = normalizePath(folderPath.trim());
	if (!norm) throw new Error("Folder path is empty.");
	const segments = norm.split("/").filter(Boolean);
	let acc = "";
	for (const seg of segments) {
		acc = acc ? `${acc}/${seg}` : seg;
		if (vault.getAbstractFileByPath(acc)) continue;
		try {
			await vault.createFolder(acc);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (!/already exists/i.test(msg)) throw e;
			const parentPath = acc.includes("/") ? acc.slice(0, acc.lastIndexOf("/")) : "";
			const folderName = acc.includes("/") ? acc.slice(acc.lastIndexOf("/") + 1) : acc;
			const parent = parentPath
				? vault.getAbstractFileByPath(parentPath)
				: vault.getRoot();
			const existing =
				parent && "children" in parent
					? (parent as TFolder).children.find(
							(c) =>
								c instanceof TFolder &&
								c.name.toLowerCase() === folderName.toLowerCase(),
						)
					: undefined;
			if (existing instanceof TFolder) {
				acc = existing.path;
				continue;
			}
			if (vault.getAbstractFileByPath(acc)) continue;
			throw e;
		}
	}
}

/**
 * Appends a log line, sets project status to the first configured “done” status, then moves the note
 * into the completed-projects folder (unless it is already there). Uses {@link FileManager.renameFile}
 * so Obsidian can update links.
 */
export async function markProjectCompleteAndMove(
	app: App,
	projectFile: TFile,
	s: FulcrumSettings,
	options?: {note?: string},
): Promise<string> {
	const destDir = normalizePath(s.completedProjectsFolder.trim());
	if (!destDir) throw new Error("Set a completed projects folder in Fulcrum settings.");

	await ensureFolderPath(app.vault, destDir);

	const note = options?.note?.replace(/\s+/g, " ").trim() ?? "";
	const logMessage = note.length > 0 ? `Marked complete — ${note}` : "Marked complete";
	await appendFulcrumProjectLog(
		app,
		projectFile,
		s.projectLogSectionHeading,
		formatFulcrumProjectLogLine(logMessage),
	);

	const statusKey = s.projectStatusField.trim().replace(/:+$/u, "") || "status";
	const doneStatuses = parseList(s.projectDoneStatuses);
	const statusValue = (doneStatuses[0] ?? "completed").trim().toLowerCase();

	await app.fileManager.processFrontMatter(projectFile, (fm) => {
		(fm as Record<string, unknown>)[statusKey] = statusValue;
	});

	const projectFolder = getSameNamedProjectFolder(projectFile);
	if (projectFolder) {
		const folderParent = normalizePath(projectFolder.parent?.path ?? "");
		if (folderParent === destDir) {
			return normalizePath(`${projectFolder.path}/${projectFile.name}`);
		}
		const newFolderPath = await moveProjectFolderToParent(app, projectFolder, destDir);
		return normalizePath(`${newFolderPath}/${projectFile.name}`);
	}

	const parent = normalizePath(projectFile.parent?.path ?? "");
	if (parent === destDir) {
		return projectFile.path;
	}

	return moveProjectFileToDir(app, projectFile, destDir);
}

/** Move project file to the folder for the given status (subfolder layout). */
export async function moveProjectToStatusFolder(
	app: App,
	projectFile: TFile,
	s: FulcrumSettings,
	newStatus: string,
): Promise<string> {
	const root = normalizePath(resolveProjectsRoot(s).trim());
	if (!root) throw new Error("Projects folder is not set (configure projects folder or areas & projects fallback).");

	const path = projectFile.path;
	if (!path.startsWith(root + "/")) {
		throw new Error("Project is not under the projects folder.");
	}

	const statusFolder = resolveStatusFolderName(app.vault, root, newStatus);

	const projectFolder = getSameNamedProjectFolder(projectFile);
	if (projectFolder) {
		const relFolder = projectFolder.path.slice(root.length + 1);
		const folderParts = relFolder.split("/").filter(Boolean);
		if (folderParts.length < 1) {
			throw new Error("Invalid project folder path.");
		}
		const destParentDir = normalizePath(
			[root, statusFolder, ...folderParts.slice(1, -1)].filter(Boolean).join("/") ||
				`${root}/${statusFolder}`,
		);
		const currentFolderParent = normalizePath(projectFolder.parent?.path ?? "");
		if (
			currentFolderParent === destParentDir ||
			currentFolderParent.toLowerCase() === destParentDir.toLowerCase()
		) {
			return path;
		}
		await ensureFolderPath(app.vault, destParentDir);
		const newFolderPath = await moveProjectFolderToParent(
			app,
			projectFolder,
			destParentDir,
		);
		return normalizePath(`${newFolderPath}/${projectFile.name}`);
	}

	const rel = path.slice(root.length + 1);
	const parts = rel.split("/").filter(Boolean);

	let destDir: string;
	if (parts.length >= 2) {
		const restWithoutFile = parts.slice(1, -1);
		destDir = [root, statusFolder, ...restWithoutFile].filter(Boolean).join("/");
	} else if (parts.length === 1) {
		destDir = `${root}/${statusFolder}`;
	} else {
		throw new Error("Invalid project path.");
	}

	destDir = normalizePath(destDir);

	const currentParent = normalizePath(projectFile.parent?.path ?? "");
	if (
		currentParent === destDir ||
		currentParent.toLowerCase() === destDir.toLowerCase()
	) {
		return path;
	}

	await ensureFolderPath(app.vault, destDir);
	return moveProjectFileToDir(app, projectFile, destDir);
}
