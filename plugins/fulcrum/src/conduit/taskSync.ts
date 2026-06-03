import type {App} from "obsidian";
import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {IndexedProject, IndexedTask} from "../fulcrum/types";
import {parseList} from "../fulcrum/settingsDefaults";
import {
	buildObsidianOpenLink,
	extractPathFromObsidianLink,
	formatReminderNotesBody,
	resolveVaultName,
} from "./deepLink";
import {areaTagsForTask} from "./conduitTasks";
import type {ProjectListMap} from "./types";
import {resolveListForTask} from "./projectListSync";
import type {RemctlClient} from "./remctlClient";
import type {ConduitEntityState, ConduitSyncState, ConduitTaskSnapshot, RemctlReminderRow} from "./types";
import {
	applyConduitTaskPatch,
	conduitDoneStatusForTask,
	conduitOpenStatusForTask,
	readTaskReminderIdAsync,
	taskIsDone,
	vaultRevisionForTask,
	writeTaskReminderId,
} from "./mapping";
import {taskVaultKey} from "./vaultKeys";

export function snapshotFromTask(task: IndexedTask, settings: FulcrumSettings): ConduitTaskSnapshot {
	return {
		title: task.title.trim(),
		status: task.status.toLowerCase(),
		dueDate: task.dueDate ?? null,
		done: taskIsDone(task, settings),
	};
}

export function snapshotFromReminder(row: RemctlReminderRow, settings: FulcrumSettings): ConduitTaskSnapshot {
	const doneStatus = parseList(settings.taskDoneStatuses)[0] ?? "done";
	return {
		title: row.title.trim(),
		status: row.completed ? doneStatus : parseList(settings.taskStatuses)[0] ?? "todo",
		dueDate: row.dueDate,
		done: row.completed,
	};
}

function revisionFromReminder(row: RemctlReminderRow): string {
	return row.lastModified || String(Date.now());
}

function dueForRemctl(iso: string | null | undefined): string | undefined {
	if (!iso?.trim()) return undefined;
	const d = iso.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
	if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(d)) {
		return d.replace("T", " ").slice(0, 16);
	}
	return d;
}

export async function adoptReminderByDeepLink(
	app: App,
	settings: FulcrumSettings,
	task: IndexedTask,
	rows: RemctlReminderRow[],
): Promise<number | null> {
	const vaultName = resolveVaultName(app, settings.conduitVaultNameOverride);
	const path = task.source === "inline" && task.line != null ? task.file.path : task.file.path;
	const expected = buildObsidianOpenLink(app, settings.conduitVaultNameOverride, path);
	for (const row of rows) {
		if (!row.notes.includes("obsidian://")) continue;
		const linked = extractPathFromObsidianLink(row.notes, vaultName);
		if (linked === path || row.notes.includes(expected)) {
			await writeTaskReminderId(app, task, settings, row.numericId);
			return row.numericId;
		}
	}
	return null;
}

export async function pullTasksFromReminders(
	app: App,
	remctl: RemctlClient,
	tasks: IndexedTask[],
	projects: IndexedProject[],
	settings: FulcrumSettings,
	listIndex: ProjectListMap,
	reminderRows: RemctlReminderRow[],
	state: ConduitSyncState,
	force: boolean,
): Promise<number> {
	let count = 0;
	const rowsByList = groupRowsByList(reminderRows);

	for (const task of tasks) {
		const vaultKey = taskVaultKey(task);
		let id = await readTaskReminderIdAsync(app, task, settings);
		const project = task.projectFile
			? projects.find((p) => p.file.path === task.projectFile!.path) ?? null
			: null;
		const listRef = resolveListForTask(project, settings, app, listIndex);
		const listRows =
			listRef.listId && rowsByList.has(listRef.listId)
				? rowsByList.get(listRef.listId)!
				: listRef.listName
					? reminderRows.filter((r) => r.listName?.toLowerCase() === listRef.listName!.toLowerCase())
					: reminderRows;

		if (id == null) {
			id = await adoptReminderByDeepLink(app, settings, task, listRows);
		}
		if (id == null) continue;

		const row = reminderRows.find((r) => r.numericId === id) ?? (await remctl.info(id));
		if (!row) continue;

		const entity = state.entities[vaultKey];
		const vaultSnap = snapshotFromTask(task, settings);
		const remSnap = snapshotFromReminder(row, settings);
		const vaultRev = vaultRevisionForTask(task);
		const remRev = revisionFromReminder(row);

		if (!force && entity) {
			const vaultChanged =
				entity.base.title !== vaultSnap.title ||
				entity.base.status !== vaultSnap.status ||
				entity.base.dueDate !== vaultSnap.dueDate ||
				entity.base.done !== vaultSnap.done;
			const remChanged =
				entity.base.title !== remSnap.title ||
				entity.base.status !== remSnap.status ||
				entity.base.dueDate !== remSnap.dueDate ||
				entity.base.done !== remSnap.done;
			if (remChanged && !vaultChanged) {
				// Obsidian Sync lag on Mac — prefer pull
			} else if (vaultChanged && !remChanged) {
				continue;
			} else if (vaultChanged && remChanged) {
				const vaultNewer = vaultRev >= entity.vaultRevision;
				const remNewer = remRev >= entity.reminderRevision;
				if (vaultNewer && !remNewer) continue;
			}
		}

		const patch: {title?: string; status?: string; dueDate?: string | null} = {};
		if (vaultSnap.title !== remSnap.title) patch.title = remSnap.title;
		if (vaultSnap.status !== remSnap.status) patch.status = remSnap.status;
		if ((vaultSnap.dueDate ?? null) !== (remSnap.dueDate ?? null)) patch.dueDate = remSnap.dueDate;

		if (vaultSnap.done !== remSnap.done) {
			// Only pull completion into the vault; never reopen a done vault task because
			// the Reminder is still open (push will mark the Reminder done).
			if (remSnap.done) {
				patch.status = conduitDoneStatusForTask(task, settings);
			} else if (!vaultSnap.done) {
				patch.status = conduitOpenStatusForTask(task, settings);
			}
		}

		if (Object.keys(patch).length > 0) {
			await applyConduitTaskPatch(app, task, settings, patch);
			count++;
		}

		state.entities[vaultKey] = entityState(
			vaultKey,
			id,
			project?.file.path,
			remSnap,
			vaultRev,
			row,
			"reminders",
		);
	}

	return count;
}

export interface PushTasksResult {
	pushed: number;
	failed: number;
}

export async function pushTasksToReminders(
	app: App,
	remctl: RemctlClient,
	tasks: IndexedTask[],
	projects: IndexedProject[],
	settings: FulcrumSettings,
	listIndex: ProjectListMap,
	state: ConduitSyncState,
	force: boolean,
): Promise<PushTasksResult> {
	let pushed = 0;
	let failed = 0;

	for (const task of tasks) {
		try {
			const didPush = await pushOneTask(
				app,
				remctl,
				task,
				projects,
				settings,
				listIndex,
				state,
				force,
			);
			if (didPush) pushed++;
		} catch (e) {
			failed++;
			console.warn("Conduit push task failed", task.file.path, e);
		}
	}

	return {pushed, failed};
}

async function pushOneTask(
	app: App,
	remctl: RemctlClient,
	task: IndexedTask,
	projects: IndexedProject[],
	settings: FulcrumSettings,
	listIndex: ProjectListMap,
	state: ConduitSyncState,
	force: boolean,
): Promise<boolean> {
	const vaultKey = taskVaultKey(task);
	const vaultSnap = snapshotFromTask(task, settings);
	const project = task.projectFile
		? projects.find((p) => p.file.path === task.projectFile!.path) ?? null
		: null;
	const listRef = resolveListForTask(project, settings, app, listIndex);
	const notes = formatReminderNotesBody(
		buildObsidianOpenLink(app, settings.conduitVaultNameOverride, task.file.path),
	);
	const due = dueForRemctl(vaultSnap.dueDate);
	const tags = areaTagsForTask(task, project, settings);

	let id = await readTaskReminderIdAsync(app, task, settings);
	const entity = state.entities[vaultKey];
	const vaultRev = vaultRevisionForTask(task);

	if (!force && entity?.reminderNumericId) {
		const remRev = entity.reminderRevision;
		if (remRev > vaultRev && entity.lastWriter === "reminders") {
			return false;
		}
	}

	if (id == null) {
		id = await remctl.add({
			title: vaultSnap.title || "Task",
			...listRef,
			due: due ?? null,
			notes,
			tags: tags.length > 0 ? tags : undefined,
		});
		if (vaultSnap.done) {
			await remctl.setDone(id, true);
		}
		await writeTaskReminderId(app, task, settings, id);
		const row = await remctl.info(id);
		state.entities[vaultKey] = entityState(
			vaultKey,
			id,
			project?.file.path,
			vaultSnap,
			vaultRev,
			row,
			"vault",
		);
		return true;
	}

	const row = await remctl.info(id);
	if (!row) {
		await writeTaskReminderId(app, task, settings, null);
		return false;
	}

	const remSnap = snapshotFromReminder(row, settings);
	let changed = false;
	if (
		remSnap.title !== vaultSnap.title ||
		remSnap.done !== vaultSnap.done ||
		(remSnap.dueDate ?? null) !== (vaultSnap.dueDate ?? null) ||
		!row.notes.includes("obsidian://")
	) {
		await remctl.edit(id, {
			title: vaultSnap.title,
			due: vaultSnap.dueDate,
			notes,
			tags: tags.length > 0 ? tags : undefined,
			...listRef,
		});
		if (remSnap.done !== vaultSnap.done) {
			await remctl.setDone(id, vaultSnap.done);
		}
		changed = true;
	} else if (remSnap.done !== vaultSnap.done) {
		await remctl.setDone(id, vaultSnap.done);
		changed = true;
	} else if (tags.length > 0) {
		await remctl.edit(id, {tags});
		changed = true;
	}

	let updated = await remctl.info(id);
	if (updated && updated.completed !== vaultSnap.done) {
		await remctl.setDone(id, vaultSnap.done);
		updated = await remctl.info(id);
		changed = true;
	}

	state.entities[vaultKey] = entityState(
		vaultKey,
		id,
		project?.file.path,
		vaultSnap,
		vaultRev,
		updated ?? row,
		"vault",
	);
	return changed;
}

function entityState(
	vaultKey: string,
	id: number,
	projectPath: string | undefined,
	snap: ConduitTaskSnapshot,
	vaultRev: string,
	row: RemctlReminderRow | null,
	writer: "vault" | "reminders",
): ConduitEntityState {
	return {
		vaultKey,
		reminderNumericId: id,
		projectPath,
		base: snap,
		vaultRevision: vaultRev,
		reminderRevision: row ? revisionFromReminder(row) : vaultRev,
		lastWriter: writer,
	};
}

function groupRowsByList(rows: RemctlReminderRow[]): Map<string, RemctlReminderRow[]> {
	const m = new Map<string, RemctlReminderRow[]>();
	for (const r of rows) {
		if (!r.listId) continue;
		const arr = m.get(r.listId) ?? [];
		arr.push(r);
		m.set(r.listId, arr);
	}
	return m;
}
