import type {App} from "obsidian";
import {Notice, TFile} from "obsidian";
import type {FulcrumSettings} from "../settingsDefaults";
import {isDoneStatus, normalizeStatusKey, parseDoneStatusSet, parseList} from "../settingsDefaults";
import type {IndexedProject, IndexedTask} from "../types";
import {parseWikiLink} from "../utils/wikilinks";
import {
	setInlineTaskChecked,
	setInlineTaskDue,
	setInlineTaskProjectLink,
	setInlineTaskScheduled,
	setInlineTaskTags,
	setInlineTaskTitle,
} from "../utils/inlineTasks";
import type {CalendarDropSlot} from "../calendar/calendarDropSlot";
import {slotStartMinutes} from "../calendar/calendarDropSlot";
import {formatSlotValue, normalizeIsoDateTime} from "../calendar/isoDateTime";
import type {KanbanDimension} from "../settingsDefaults";
import type {DateBucketId} from "./dateBuckets";
import {representativeDateForBucket} from "./dateBuckets";
import {NO_PROJECT, UNASSIGNED_AREA} from "./buildBoard";
import {handleRecurringTaskComplete, taskIsRecurring} from "../recurrence/recurrenceComplete";
import type {TaskReminderSpec} from "../types";
import {presetRecurrence} from "../recurrence/recurrenceEngine";

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
			} else if (typeof v === "string") {
				fm[k] = normalizeIsoDateTime(v) ?? v;
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
	const doneSet = parseDoneStatusSet(settings.taskDoneStatuses);

	if (task.source === "taskNote") {
		const targetNorm = normalizeStatusKey(targetStatusId);
		const yamlDone = settings.taskNoteYamlStatusDone.trim().toLowerCase();
		const isDone = isDoneStatus(targetStatusId, doneSet) || (yamlDone.length > 0 && targetNorm === yamlDone);
		if (isDone && taskIsRecurring(task)) {
			await handleRecurringTaskComplete(app, task, settings);
			return;
		}
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

	const targetNorm = normalizeStatusKey(targetStatusId);
	if (isDoneStatus(targetStatusId, doneSet)) {
		await updateInlineLine(app, task, (line) => setInlineTaskChecked(line, true));
		return;
	}
	await updateInlineLine(app, task, (line) => setInlineTaskChecked(line, false));
}

export async function applyTaskPriorityChange(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	priority: string | null,
): Promise<void> {
	if (task.source === "taskNote") {
		await updateTaskNoteField(app, task, settings, {
			[settings.taskPriorityField]: priority,
		});
		return;
	}
	new Notice("Priority editing is supported for task notes only.");
}

export async function applyTaskDueChange(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	dueIso: string | null,
): Promise<void> {
	if (task.source === "taskNote") {
		await updateTaskNoteField(app, task, settings, {
			[settings.taskDueDateField]: dueIso,
		});
		return;
	}
	await updateInlineLine(app, task, (line) => setInlineTaskDue(line, dueIso));
}

export async function applyTaskScheduledOnlyChange(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	schedIso: string | null,
): Promise<void> {
	if (task.source === "taskNote") {
		await updateTaskNoteField(app, task, settings, {
			[settings.taskScheduledDateField]: schedIso,
		});
		return;
	}
	await updateInlineLine(app, task, (line) => setInlineTaskScheduled(line, schedIso));
}

export async function applyTaskRemindersChange(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	reminders: TaskReminderSpec[] | null,
): Promise<void> {
	if (task.source !== "taskNote") {
		new Notice("Reminders are supported for task notes only.");
		return;
	}
	const key = settings.taskRemindersField.trim() || "reminders";
	await updateTaskNoteField(app, task, settings, {
		[key]: reminders && reminders.length > 0 ? reminders : null,
	});
}

export async function applyTaskRecurrenceChange(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	recurrence: string | null,
	anchor?: "scheduled" | "done",
): Promise<void> {
	if (task.source !== "taskNote") {
		new Notice("Recurrence is supported for task notes only.");
		return;
	}
	const recKey = settings.taskRecurrenceField.trim() || "recurrence";
	const anchorKey = settings.taskRecurrenceAnchorField.trim() || "recurrence_anchor";
	const patch: Record<string, unknown> = {
		[recKey]: recurrence,
	};
	if (anchor) patch[anchorKey] = anchor;
	else if (!recurrence) patch[anchorKey] = null;
	await updateTaskNoteField(app, task, settings, patch);
}

export async function applyTaskRecurrencePreset(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	preset: "daily" | "weekly" | "monthly",
): Promise<void> {
	const start = task.scheduledDate ?? task.dueDate ?? new Date().toISOString().slice(0, 10);
	await applyTaskRecurrenceChange(app, task, settings, presetRecurrence(preset, start), "scheduled");
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

export async function applyTaskTitleChange(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	title: string,
): Promise<void> {
	const trimmed = title.trim();
	if (!trimmed) throw new Error("Title is required.");
	if (task.source === "taskNote") {
		await updateTaskNoteField(app, task, settings, {
			[settings.taskTitleField]: trimmed,
		});
		return;
	}
	const {setInlineTaskTitle} = await import("../utils/inlineTasks");
	await updateInlineLine(app, task, (line) => setInlineTaskTitle(line, trimmed));
}

export async function applyTaskTagsChange(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	tags: string[],
): Promise<void> {
	const normalized = [...new Set(tags.map((t) => t.trim().replace(/^#/, "")).filter(Boolean))];
	if (task.source === "taskNote") {
		const designated = settings.taskTag.trim().replace(/^#/, "");
		if (
			designated &&
			!normalized.some((t) => t.toLowerCase() === designated.toLowerCase())
		) {
			normalized.unshift(designated);
		}
		await updateTaskNoteField(app, task, settings, {tags: normalized});
		return;
	}
	await updateInlineLine(app, task, (line) => setInlineTaskTags(line, normalized));
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

export type TaskScheduleDateField = "due" | "scheduled";

export async function applyTaskScheduleOnDate(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	dateIso: string,
	field: TaskScheduleDateField,
): Promise<void> {
	await applyTaskScheduleOnSlot(
		app,
		task,
		settings,
		{dateIso, hour: null},
		field,
	);
}

export async function applyTaskScheduleOnSlot(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	slot: CalendarDropSlot,
	field: TaskScheduleDateField,
): Promise<void> {
	const startMinutes = slotStartMinutes(slot);
	const value = formatSlotValue(slot.dateIso, startMinutes);
	if (task.source === "taskNote") {
		const key =
			field === "due" ? settings.taskDueDateField : settings.taskScheduledDateField;
		await updateTaskNoteField(app, task, settings, {[key]: value});
		return;
	}

	await updateInlineLine(app, task, (line) =>
		field === "due" ? setInlineTaskDue(line, value) : setInlineTaskScheduled(line, value),
	);
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
