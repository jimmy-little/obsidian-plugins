import type {App} from "obsidian";
import type {FulcrumSettings} from "../settingsDefaults";
import {parseList} from "../settingsDefaults";
import type {IndexedTask} from "../types";
import {updateTaskNoteField} from "../kanban/taskFieldUpdate";
import {resolveCurrentRecurringOccurrenceIso} from "../tasks/horizonRecurringOccurrences";
import {
	buildRecurringOccurrenceAdvancePatch,
	isoDateOnly,
	type RecurrenceAdvanceAction,
} from "./recurrenceEngine";

function recurrenceFieldKeys(settings: FulcrumSettings) {
	return {
		status: settings.taskStatusField,
		completedDate: settings.taskCompletedDateField,
		scheduled: settings.taskScheduledDateField,
		due: settings.taskDueDateField,
		completeInstances: settings.taskCompleteInstancesField.trim() || "complete_instances",
		skippedInstances: settings.taskSkippedInstancesField.trim() || "skipped_instances",
		openStatus: parseList(settings.taskStatuses)[0] ?? "todo",
		doneStatus: parseList(settings.taskDoneStatuses)[0] ?? "done",
		maintainDueOffset: settings.recurrenceMaintainDueOffset,
	};
}

async function advanceRecurringTaskOccurrence(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
	action: RecurrenceAdvanceAction,
): Promise<boolean> {
	if (task.source !== "taskNote" || !task.recurrence?.trim()) return false;

	const occurrenceDate =
		resolveCurrentRecurringOccurrenceIso(task) ??
		isoDateOnly(task.scheduledDate) ??
		new Date().toISOString().slice(0, 10);

	const patch = buildRecurringOccurrenceAdvancePatch(
		occurrenceDate,
		{
			recurrence: task.recurrence,
			scheduledDate: task.scheduledDate,
			dueDate: task.dueDate,
			recurrenceAnchor: task.recurrenceAnchor,
			completeInstances: task.completeInstances ?? [],
			skippedInstances: task.skippedInstances ?? [],
		},
		recurrenceFieldKeys(settings),
		action,
	);

	await updateTaskNoteField(app, task, settings, patch);
	return true;
}

/** When a recurring task note is marked done, roll forward scheduled/due. */
export async function handleRecurringTaskComplete(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
): Promise<boolean> {
	return advanceRecurringTaskOccurrence(app, task, settings, "complete");
}

/** Skip the current occurrence without marking it complete. */
export async function handleRecurringTaskSkip(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
): Promise<boolean> {
	return advanceRecurringTaskOccurrence(app, task, settings, "skip");
}

export function taskIsRecurring(task: IndexedTask): boolean {
	return task.source === "taskNote" && !!task.recurrence?.trim() && !task.recurrenceParentPath;
}
