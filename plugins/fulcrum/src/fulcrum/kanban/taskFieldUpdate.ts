import type {App} from "obsidian";
import {Notice, TFile} from "obsidian";
import type {FulcrumSettings} from "../settingsDefaults";
import {parseList} from "../settingsDefaults";
import type {IndexedProject, IndexedTask} from "../types";
import {parseWikiLink} from "../utils/wikilinks";
import {
	setInlineTaskChecked,
	setInlineTaskDue,
	setInlineTaskProjectLink,
} from "../utils/inlineTasks";
import type {KanbanDimension} from "../settingsDefaults";
import type {DateBucketId} from "./dateBuckets";
import {representativeDateForBucket} from "./dateBuckets";
import {NO_PROJECT, UNASSIGNED_AREA} from "./buildBoard";

export async function updateTaskNoteField(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	patch: Record<string, unknown>,
): Promise<void> {
	await app.fileManager.processFrontMatter(task.file, (fm) => {
		for (const [k, v] of Object.entries(patch)) {
			if (v === null || v === undefined) {
				delete fm[k];
			} else {
				fm[k] = v;
			}
		}
	});
}

async function updateInlineLine(
	app: App,
	task: IndexedTask,
	transform: (line: string) => string | null,
): Promise<void> {
	if (task.line == null) throw new Error("Inline task has no line");
	const lines = (await app.vault.read(task.file)).split("\n");
	const line = lines[task.line];
	if (line === undefined) throw new Error("Task line not found");
	const next = transform(line);
	if (next == null) throw new Error("Could not update inline task line");
	lines[task.line] = next;
	await app.vault.modify(task.file, lines.join("\n"));
}

export async function applyTaskStatusChange(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	targetStatusId: string,
): Promise<void> {
	const doneSet = new Set(parseList(settings.taskDoneStatuses));
	const openStatus = parseList(settings.taskStatuses)[0] ?? "todo";
	const doneStatus = parseList(settings.taskDoneStatuses)[0] ?? "done";

	if (task.source === "taskNote") {
		const isDone = doneSet.has(targetStatusId);
		const patch: Record<string, unknown> = {
			[settings.taskStatusField]: targetStatusId,
		};
		if (isDone) {
			patch[settings.taskCompletedDateField] = new Date().toISOString().slice(0, 10);
		} else {
			patch[settings.taskCompletedDateField] = null;
		}
		await updateTaskNoteField(app, task, settings, patch);
		return;
	}

	if (doneSet.has(targetStatusId)) {
		await updateInlineLine(app, task, (line) => setInlineTaskChecked(line, true));
		return;
	}
	if (targetStatusId === openStatus) {
		await updateInlineLine(app, task, (line) => setInlineTaskChecked(line, false));
		return;
	}
	new Notice("Inline tasks only support open and done status columns.");
}

export async function applyTaskAreaChange(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	areaPath: string,
	areas: {file: TFile; name: string}[],
): Promise<void> {
	let link: string | null = null;
	if (areaPath !== UNASSIGNED_AREA) {
		const area = areas.find((a) => a.file.path === areaPath);
		if (area) link = `[[${area.file.basename.replace(/\.md$/i, "")}]]`;
	}

	if (task.source === "taskNote") {
		await updateTaskNoteField(app, task, settings, {
			[settings.areaLinkField]: link,
		});
		return;
	}

	await app.fileManager.processFrontMatter(task.file, (fm) => {
		if (link) fm[settings.areaLinkField] = link;
		else delete fm[settings.areaLinkField];
	});
}

export async function applyTaskProjectChange(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	projectPath: string,
	projects: IndexedProject[],
): Promise<void> {
	let link: string | null = null;
	if (projectPath !== NO_PROJECT) {
		const p = projects.find((x) => x.file.path === projectPath);
		if (p) link = `[[${p.file.basename.replace(/\.md$/i, "")}]]`;
	}

	if (task.source === "taskNote") {
		await updateTaskNoteField(app, task, settings, {
			[settings.projectLinkField]: link,
		});
		return;
	}

	const basename = link ? parseWikiLink(link) : null;
	await updateInlineLine(app, task, (line) =>
		setInlineTaskProjectLink(line, basename),
	);
}

export async function applyTaskDateChange(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	bucketId: DateBucketId,
): Promise<void> {
	const iso = representativeDateForBucket(bucketId, settings.calendarFirstDayOfWeek);

	if (task.source === "taskNote") {
		if (iso) {
			await updateTaskNoteField(app, task, settings, {
				[settings.taskDueDateField]: iso,
			});
		} else {
			await updateTaskNoteField(app, task, settings, {
				[settings.taskDueDateField]: null,
			});
		}
		return;
	}

	await updateInlineLine(app, task, (line) => setInlineTaskDue(line, iso));
}

export async function applyProjectAreaChange(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
	areaPath: string,
	areas: {file: TFile; name: string}[],
): Promise<void> {
	let link: string | null = null;
	if (areaPath !== UNASSIGNED_AREA) {
		const area = areas.find((a) => a.file.path === areaPath);
		if (area) link = `[[${area.file.basename.replace(/\.md$/i, "")}]]`;
	}
	await app.fileManager.processFrontMatter(project.file, (fm) => {
		if (link) fm[settings.areaLinkField] = link;
		else delete fm[settings.areaLinkField];
	});
}

export async function applyProjectDateChange(
	app: App,
	project: IndexedProject,
	settings: FulcrumSettings,
	bucketId: DateBucketId,
): Promise<void> {
	const iso = representativeDateForBucket(bucketId, settings.calendarFirstDayOfWeek);
	const key =
		settings.kanbanProjectDateSource === "deadline"
			? settings.projectDeadlineField
			: settings.projectNextReviewField;
	await app.fileManager.processFrontMatter(project.file, (fm) => {
		if (iso) fm[key] = iso;
		else delete fm[key];
	});
}

export type KanbanDropTarget = {
	dimension: KanbanDimension;
	columnId: string;
};

export async function applyKanbanTaskDrop(
	app: App,
	settings: FulcrumSettings,
	task: IndexedTask,
	target: KanbanDropTarget,
	snapshot: {areas: {file: TFile; name: string}[]; projects: IndexedProject[]},
): Promise<void> {
	switch (target.dimension) {
		case "status":
			await applyTaskStatusChange(app, task, settings, target.columnId);
			break;
		case "area":
			await applyTaskAreaChange(app, task, settings, target.columnId, snapshot.areas);
			break;
		case "project":
			await applyTaskProjectChange(
				app,
				task,
				settings,
				target.columnId,
				snapshot.projects,
			);
			break;
		case "date":
			await applyTaskDateChange(app, task, settings, target.columnId as DateBucketId);
			break;
	}
}

export async function applyKanbanProjectDrop(
	app: App,
	settings: FulcrumSettings,
	project: IndexedProject,
	target: KanbanDropTarget,
	snapshot: {areas: {file: TFile; name: string}[]},
	applyStatus: (
		projectPath: string,
		status: string,
	) => Promise<void>,
): Promise<void> {
	switch (target.dimension) {
		case "status": {
			const current = (project.status || "").trim().toLowerCase();
			const next = target.columnId.trim().toLowerCase();
			if (current === next) break;
			await applyStatus(project.file.path, target.columnId);
			break;
		}
		case "area": {
			const currentArea = project.areaFiles[0]?.path ?? UNASSIGNED_AREA;
			if (currentArea === target.columnId) break;
			await applyProjectAreaChange(
				app,
				project,
				settings,
				target.columnId,
				snapshot.areas,
			);
			break;
		}
		case "date":
			await applyProjectDateChange(
				app,
				project,
				settings,
				target.columnId as DateBucketId,
			);
			break;
		case "project":
			break;
	}
}
