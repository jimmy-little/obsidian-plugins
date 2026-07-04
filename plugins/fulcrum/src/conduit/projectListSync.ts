import type {App} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {IndexedProject} from "../fulcrum/types";
import {readProjectListId} from "./mapping";
import type {RemindersBridge} from "./remindersBridge";
import type {ProjectListMap, RemctlListRow} from "./types";
import {remctlListColorArgs} from "./projectMeta";

export function indexLists(lists: RemctlListRow[]): ProjectListMap {
	const byId = new Map<string, RemctlListRow>();
	const byName = new Map<string, RemctlListRow>();
	for (const l of lists) {
		byId.set(l.id, l);
		byName.set(l.name.toLowerCase(), l);
	}
	return {byId, byName, projectPathToListId: new Map()};
}

function rememberProjectList(
	lists: ProjectListMap,
	projectPath: string,
	listId: string,
	name: string,
): void {
	lists.projectPathToListId.set(projectPath, listId);
	const row: RemctlListRow = {id: listId, name};
	lists.byId.set(listId, row);
	lists.byName.set(name.toLowerCase(), row);
}

export async function applyListColorForProject(
	bridge: RemindersBridge,
	project: IndexedProject,
	listId: string,
	settings: FulcrumSettings,
): Promise<void> {
	if (!settings.conduitSyncListColors) return;
	const color = remctlListColorArgs(project.color);
	if (!color) return;
	try {
		await bridge.listEdit(listId, {
			color: color.color,
			usePrivate: color.usePrivate || color.color.startsWith("#"),
		});
	} catch (e) {
		console.warn("Reminders list color failed", project.file.path, e);
	}
}

export async function ensureInboxList(
	bridge: RemindersBridge,
	settings: FulcrumSettings,
	listIndex: ProjectListMap,
): Promise<ProjectListMap> {
	const name = settings.conduitInboxListName.trim() || "Fulcrum Inbox";
	const existing = listIndex.byName.get(name.toLowerCase());
	if (existing) {
		rememberProjectList(listIndex, `__inbox__:${name}`, existing.id, name);
		return listIndex;
	}
	try {
		const id = await bridge.listCreate(name);
		rememberProjectList(listIndex, `__inbox__:${name}`, id, name);
	} catch (e) {
		console.warn("Inbox list create failed", e);
	}
	return listIndex;
}

export function resolveListForTask(
	project: IndexedProject | null,
	settings: FulcrumSettings,
	app: App,
	listIndex: ProjectListMap,
): {listId?: string; listName?: string} {
	if (project) {
		const fromPass = listIndex.projectPathToListId.get(project.file.path);
		if (fromPass && listIndex.byId.has(fromPass)) return {listId: fromPass};

		const id = readProjectListId(app, project, settings);
		if (id && listIndex.byId.has(id)) return {listId: id};
		return {};
	}
	const inbox = settings.conduitInboxListName.trim() || "Fulcrum Inbox";
	const inboxKey = `__inbox__:${inbox}`;
	const inboxId = listIndex.projectPathToListId.get(inboxKey);
	if (inboxId && listIndex.byId.has(inboxId)) return {listId: inboxId};
	if (listIndex.byName.has(inbox.toLowerCase())) {
		const row = listIndex.byName.get(inbox.toLowerCase())!;
		return {listId: row.id};
	}
	return {listName: inbox};
}
