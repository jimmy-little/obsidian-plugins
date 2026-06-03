import type {App} from "obsidian";
import {Notice} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {IndexedProject} from "../fulcrum/types";
import type {RemctlClient} from "./remctlClient";
import type {ProjectListMap, RemctlListRow} from "./types";
import {isProjectDone, readProjectListId, writeProjectListId} from "./mapping";
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

async function applyListColorAndNotes(
	remctl: RemctlClient,
	project: IndexedProject,
	listId: string,
	settings: FulcrumSettings,
): Promise<void> {
	if (!settings.conduitSyncListColors) return;
	const color = remctlListColorArgs(project.color);
	if (!color) return;
	try {
		await remctl.listEdit(listId, {
			color: color.color,
			usePrivate: color.usePrivate || color.color.startsWith("#"),
		});
	} catch (e) {
		console.warn("Conduit list color sync failed", project.file.path, e);
	}
}

export async function ensureInboxList(
	remctl: RemctlClient,
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
		const id = await remctl.listCreate(name);
		rememberProjectList(listIndex, `__inbox__:${name}`, id, name);
	} catch (e) {
		console.warn("Conduit inbox list create failed", e);
	}
	return listIndex;
}

export async function ensureProjectLists(
	app: App,
	remctl: RemctlClient,
	projects: IndexedProject[],
	settings: FulcrumSettings,
	listIndex: ProjectListMap,
): Promise<ProjectListMap> {
	let lists = listIndex;
	for (const project of projects) {
		if (isProjectDone(project, settings, project.file.path)) continue;
		const archivedKey = settings.conduitListArchivedField.trim() || "conduitListArchived";
		const cache = app.metadataCache.getFileCache(project.file);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		if (fm?.[archivedKey] === true) continue;

		let listId = readProjectListId(app, project, settings);
		const listName = project.name.trim() || project.file.basename.replace(/\.md$/i, "");

		if (listId && lists.byId.has(listId)) {
			const existing = lists.byId.get(listId)!;
			if (existing.name !== listName) {
				try {
					await remctl.listRename(listId, listName);
					existing.name = listName;
					lists.byName.set(listName.toLowerCase(), existing);
				} catch (e) {
					console.warn("Conduit list rename failed", e);
				}
			}
			rememberProjectList(lists, project.file.path, listId, listName);
			await writeProjectListId(app, project, settings, listId);
			await applyListColorAndNotes(remctl, project, listId, settings);
			continue;
		}

		const byName = lists.byName.get(listName.toLowerCase());
		if (byName) {
			listId = byName.id;
			await writeProjectListId(app, project, settings, listId);
			rememberProjectList(lists, project.file.path, listId, listName);
			await applyListColorAndNotes(remctl, project, listId, settings);
			continue;
		}

		try {
			const color = settings.conduitSyncListColors
				? remctlListColorArgs(project.color)
				: null;
			listId = await remctl.listCreate(listName, color ?? undefined);
			await writeProjectListId(app, project, settings, listId);
			rememberProjectList(lists, project.file.path, listId, listName);
		} catch (e) {
			console.error("Conduit list-create failed", project.file.path, e);
		}
	}
	return lists;
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
		const name = project.name.trim() || project.file.basename.replace(/\.md$/i, "");
		const byName = listIndex.byName.get(name.toLowerCase());
		if (byName) return {listId: byName.id};
		return {listName: name};
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

export async function archiveProjectListIfEmpty(
	app: App,
	remctl: RemctlClient,
	projectPath: string,
	projects: IndexedProject[],
	settings: FulcrumSettings,
): Promise<void> {
	const project = projects.find((p) => p.file.path === projectPath);
	if (!project) return;

	const listId = readProjectListId(app, project, settings);
	if (!listId) return;

	const rows = await remctl.showList({listId});
	const incomplete = rows.filter((r) => !r.completed);
	if (incomplete.length > 0) {
		new Notice(
			`Conduit: Reminders list "${project.name}" still has ${incomplete.length} open task(s). Archive skipped.`,
		);
		return;
	}

	const prefix = settings.conduitArchivedListPrefix || "✓ ";
	const lists = await remctl.lists();
	const current = lists.find((l) => l.id === listId);
	const newName = current?.name.startsWith(prefix)
		? current.name
		: `${prefix}${current?.name ?? project.name}`;

	try {
		await remctl.listUnpin({listId});
		if (current && current.name !== newName) {
			await remctl.listRename(listId, newName);
		}
		const archivedKey = settings.conduitListArchivedField.trim() || "conduitListArchived";
		await app.fileManager.processFrontMatter(project.file, (fm) => {
			fm[archivedKey] = true;
		});
		new Notice(`Conduit: archived Reminders list for ${project.name}.`);
	} catch (e) {
		console.error("Conduit archive list failed", e);
		new Notice("Conduit: could not archive Reminders list.");
	}
}
