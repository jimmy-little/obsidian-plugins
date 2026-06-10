import type {App} from "obsidian";
import {Notice} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import {isProjectDone} from "../fulcrum/settingsDefaults";
import type {FulcrumHost} from "../fulcrum/pluginBridge";
import type {IndexedProject} from "../fulcrum/types";
import {
	readProjectConduitSync,
	readProjectListId,
	writeProjectConduitSync,
	writeProjectListId,
} from "./mapping";
import {RemctlClient} from "./remctlClient";
import {applyListColorForProject} from "./projectListSync";
import {remctlListColorArgs} from "./projectMeta";
import type {ProjectListMap} from "./types";

export function resolveProjectReminderConnection(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
	listIndex: ProjectListMap,
): {listId: string; listName: string} | null {
	const listId = readProjectListId(app, project, settings);
	if (!listId || !listIndex.byId.has(listId)) return null;
	const row = listIndex.byId.get(listId)!;
	return {listId, listName: row.name};
}

export function isProjectConduitConnected(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
	listIndex: ProjectListMap,
): boolean {
	return resolveProjectReminderConnection(app, project, settings, listIndex) != null;
}

export function isProjectConduitSyncEnabled(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
	listIndex: ProjectListMap,
): boolean {
	if (isProjectDone(project, settings)) return false;
	if (!readProjectConduitSync(app, project, settings)) return false;
	return resolveProjectReminderConnection(app, project, settings, listIndex) != null;
}

export function filterProjectsForConduitSync(
	app: App,
	settings: FulcrumSettings,
	projects: IndexedProject[],
	listIndex: ProjectListMap,
): IndexedProject[] {
	return projects.filter(
		(p) => !isProjectDone(p, settings) && isProjectConduitSyncEnabled(app, p, settings, listIndex),
	);
}

function isListArchived(project: IndexedProject, app: App, settings: FulcrumSettings): boolean {
	const archivedKey = settings.conduitListArchivedField.trim() || "conduitListArchived";
	const cache = app.metadataCache.getFileCache(project.file);
	const fm = cache?.frontmatter as Record<string, unknown> | undefined;
	return fm?.[archivedKey] === true;
}

export async function connectProjectToReminderList(
	app: App,
	remctl: RemctlClient,
	project: IndexedProject,
	listId: string,
	settings: FulcrumSettings,
	listIndex: ProjectListMap,
): Promise<void> {
	const row = listIndex.byId.get(listId);
	if (!row) throw new Error("Reminders list not found.");
	await writeProjectListId(app, project, settings, listId);
	await writeProjectConduitSync(app, project, settings, true);
	await applyListColorForProject(remctl, project, listId, settings);
}

export async function createReminderListForProject(
	app: App,
	remctl: RemctlClient,
	project: IndexedProject,
	settings: FulcrumSettings,
	listIndex: ProjectListMap,
): Promise<string> {
	const listName = project.name.trim() || project.file.basename.replace(/\.md$/i, "");
	const color = settings.conduitSyncListColors ? remctlListColorArgs(project.color) : null;
	const listId = await remctl.listCreate(listName, color ?? undefined);
	// Register the newly created list in the index so connectProjectToReminderList can find it.
	const newRow = {id: listId, name: listName};
	listIndex.byId.set(listId, newRow);
	listIndex.byName.set(listName.toLowerCase(), newRow);
	await connectProjectToReminderList(app, remctl, project, listId, settings, listIndex);
	return listId;
}

export async function disableProjectConduitSync(host: FulcrumHost, projectPath: string): Promise<void> {
	const project = host.vaultIndex.resolveProjectByPath(projectPath);
	if (!project) throw new Error("Project not found.");
	await writeProjectConduitSync(host.app, project, host.settings, false);
	await host.vaultIndex.rebuild();
	new Notice(`Stopped Reminders sync for "${project.name}".`);
}

export async function enableProjectConduitSyncIfLinked(host: FulcrumHost, projectPath: string): Promise<boolean> {
	const project = host.vaultIndex.resolveProjectByPath(projectPath);
	if (!project) throw new Error("Project not found.");
	const listId = readProjectListId(host.app, project, host.settings);
	if (!listId) return false;
	if (isListArchived(project, host.app, host.settings)) {
		throw new Error("This project's Reminders list is archived.");
	}
	await writeProjectConduitSync(host.app, project, host.settings, true);
	await host.vaultIndex.rebuild();
	new Notice(`Reminders sync enabled for "${project.name}".`);
	return true;
}

export function findProjectByPath(
	projects: IndexedProject[],
	projectPath: string,
): IndexedProject | null {
	return projects.find((p) => p.file.path === projectPath) ?? null;
}
