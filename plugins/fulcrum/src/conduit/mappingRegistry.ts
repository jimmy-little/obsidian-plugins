import type {App} from "obsidian";
import {Notice} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {FulcrumHost} from "../fulcrum/pluginBridge";
import type {IndexedProject} from "../fulcrum/types";
import {readProjectListId, writeProjectListId} from "./mapping";
import type {RemindersBridge} from "./remindersBridge";
import {applyListColorForProject} from "./projectListSync";
import {remctlListColorArgs} from "./projectMeta";
import type {ProjectListMap, RemctlListRow} from "./types";

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

export async function connectProjectToReminderList(
	app: App,
	bridge: RemindersBridge,
	project: IndexedProject,
	listId: string,
	settings: FulcrumSettings,
	listIndex: ProjectListMap,
): Promise<void> {
	const row = listIndex.byId.get(listId);
	if (!row) throw new Error("Reminders list not found.");
	await writeProjectListId(app, project, settings, listId);
	await applyListColorForProject(bridge, project, listId, settings);
}

export async function createReminderListForProject(
	app: App,
	bridge: RemindersBridge,
	project: IndexedProject,
	settings: FulcrumSettings,
	listIndex: ProjectListMap,
): Promise<string> {
	const listName = project.name.trim() || project.file.basename.replace(/\.md$/i, "");
	const color = settings.conduitSyncListColors ? remctlListColorArgs(project.color) : null;
	const listId = await bridge.listCreate(listName, color ?? undefined);
	const newRow: RemctlListRow = {id: listId, name: listName};
	listIndex.byId.set(listId, newRow);
	listIndex.byName.set(listName.toLowerCase(), newRow);
	await connectProjectToReminderList(app, bridge, project, listId, settings, listIndex);
	return listId;
}

export async function clearProjectReminderList(host: FulcrumHost, projectPath: string): Promise<void> {
	const project = host.vaultIndex.resolveProjectByPath(projectPath);
	if (!project) throw new Error("Project not found.");
	await writeProjectListId(host.app, project, host.settings, null);
	await host.vaultIndex.rebuild();
	new Notice(`Cleared Reminders list for "${project.name}".`);
}

export function findProjectByPath(
	projects: IndexedProject[],
	projectPath: string,
): IndexedProject | null {
	return projects.find((p) => p.file.path === projectPath) ?? null;
}
