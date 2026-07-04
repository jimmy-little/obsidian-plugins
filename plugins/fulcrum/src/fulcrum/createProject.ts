import type {Vault} from "obsidian";
import {normalizePath} from "obsidian";
import {resolveStatusFolderName} from "./projectCompletion";
import {uniqueFolderPathInParent, uniqueFilePathInDir} from "./projectMove";
import {parseList, resolveProjectsRoot, type FulcrumSettings} from "./settingsDefaults";

export type NewProjectPaths = {
	projectFolderPath: string;
	projectFilePath: string;
	initialStatus: string;
	statusFolder: string;
};

/** Resolve folder + note paths for a new project under the status parent folder. */
export function resolveNewProjectPaths(
	vault: Vault,
	settings: FulcrumSettings,
	projectName: string,
): NewProjectPaths | null {
	const root = normalizePath(resolveProjectsRoot(settings).trim());
	if (!root) return null;

	const activeStatuses = parseList(settings.projectActiveStatuses);
	const initialStatus = (activeStatuses[0] ?? "planning").trim().toLowerCase();
	const statusFolder = resolveStatusFolderName(vault, root, initialStatus);
	const statusParentDir = normalizePath(`${root}/${statusFolder}`);
	const projectFolderPath = uniqueFolderPathInParent(vault, statusParentDir, projectName);
	const folderName = projectFolderPath.slice(projectFolderPath.lastIndexOf("/") + 1);
	const projectFilePath = uniqueFilePathInDir(vault, projectFolderPath, `${folderName}.md`);

	return {projectFolderPath, projectFilePath, initialStatus, statusFolder};
}
