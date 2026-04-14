import type {App} from "obsidian";
import {TFile} from "obsidian";
import {Notice} from "obsidian";
import {moveProjectToStatusFolder} from "./projectCompletion";
import type {FulcrumHost} from "./pluginBridge";
import {parseList, resolveProjectsRoot} from "./settingsDefaults";
import type {FulcrumSettings} from "./settingsDefaults";
import {getImmediateSubfolderNames} from "./utils/paths";

/** Same option list as {@link ChangeProjectStatusModal} (folders + configured statuses). */
export function getProjectStatusOptions(app: App, s: FulcrumSettings): string[] {
	const projectsRoot = resolveProjectsRoot(s);
	const useSubfolders = s.projectStatusIndication === "subfolder" && projectsRoot.trim().length > 0;
	if (useSubfolders) {
		const folderNames = getImmediateSubfolderNames(app.vault, projectsRoot);
		const configured = parseList(s.projectStatuses)
			.map((x) => x.trim())
			.filter(Boolean);
		const folderSet = new Set(folderNames.map((n) => n.toLowerCase()));
		const extra = configured.filter((x) => !folderSet.has(x.toLowerCase()));
		return folderNames.length > 0 ? [...folderNames, ...extra] : configured;
	}
	return parseList(s.projectStatuses)
		.map((x) => x.trim())
		.filter(Boolean);
}

export type ApplyProjectStatusOptions = {
	setFrontmatter: boolean;
	updateFolder: boolean;
};

/**
 * Update project status (frontmatter and/or folder move) and rebuild the index.
 * @returns New file path when a folder move occurred.
 */
export async function applyProjectStatusChange(
	app: App,
	host: FulcrumHost,
	projectPath: string,
	selectedStatus: string,
	options: ApplyProjectStatusOptions,
): Promise<string | undefined> {
	const f = app.vault.getAbstractFileByPath(projectPath);
	if (!(f instanceof TFile)) {
		new Notice("Project file not found.");
		throw new Error("Fulcrum: project file not found");
	}

	if (options.setFrontmatter) {
		const statusKey = host.settings.projectStatusField.trim().replace(/:+$/u, "") || "status";
		const statusValue = selectedStatus.trim().toLowerCase();
		await app.fileManager.processFrontMatter(f, (fm) => {
			(fm as Record<string, unknown>)[statusKey] = statusValue;
		});
	}

	let newPath: string | undefined;
	if (options.updateFolder) {
		newPath = await moveProjectToStatusFolder(app, f, host.settings, selectedStatus);
	}

	await host.vaultIndex.rebuild();
	new Notice("Project status updated.");
	return newPath;
}

/** Defaults for quick actions (context menu): match initial toggles in {@link ChangeProjectStatusModal}. */
export function defaultApplyStatusOptions(host: FulcrumHost): ApplyProjectStatusOptions {
	const updateFolder =
		host.settings.projectStatusIndication === "subfolder" &&
		resolveProjectsRoot(host.settings).trim().length > 0;
	return {setFrontmatter: true, updateFolder};
}
