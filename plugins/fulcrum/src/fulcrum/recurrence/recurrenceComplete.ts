import type {App} from "obsidian";
import type {FulcrumSettings} from "../settingsDefaults";
import {parseList} from "../settingsDefaults";
import type {IndexedTask} from "../types";
import {updateTaskNoteField} from "../kanban/taskFieldUpdate";
import {
	addDaysToIso,
	completionDateForTask,
	computeNextScheduledAfterComplete,
	daysBetween,
} from "./recurrenceEngine";

/**
 * When a recurring task note is marked done, roll forward scheduled/due and
 * append to complete_instances (TaskNotes-compatible).
 */
export async function handleRecurringTaskComplete(
	app: App,
	task: IndexedTask,
	settings: FulcrumSettings,
): Promise<boolean> {
	if (task.source !== "taskNote" || !task.recurrence?.trim()) return false;

	const openStatus = parseList(settings.taskStatuses)[0] ?? "todo";
	const completedOn = completionDateForTask(task.scheduledDate, task.recurrenceAnchor);
	const completeKey = settings.taskCompleteInstancesField.trim() || "complete_instances";
	const instances = [...(task.completeInstances ?? [])];
	if (!instances.includes(completedOn)) instances.push(completedOn);

	const nextSched = computeNextScheduledAfterComplete(
		task.recurrence,
		task.scheduledDate,
		completedOn,
		instances,
		task.skippedInstances ?? [],
		task.recurrenceAnchor,
	);

	const patch: Record<string, unknown> = {
		[settings.taskStatusField]: openStatus,
		[settings.taskCompletedDateField]: null,
		[completeKey]: instances,
	};

	if (nextSched) {
		patch[settings.taskScheduledDateField] = nextSched;
		if (settings.recurrenceMaintainDueOffset && task.dueDate && task.scheduledDate) {
			const offset = daysBetween(task.scheduledDate, task.dueDate);
			if (offset != null) {
				patch[settings.taskDueDateField] = addDaysToIso(nextSched, offset);
			}
		}
	} else {
		const doneStatus = parseList(settings.taskDoneStatuses)[0] ?? "done";
		patch[settings.taskStatusField] = doneStatus;
		patch[settings.taskCompletedDateField] = completedOn;
	}

	await updateTaskNoteField(app, task, settings, patch);
	return true;
}

export function taskIsRecurring(task: IndexedTask): boolean {
	return task.source === "taskNote" && !!task.recurrence?.trim() && !task.recurrenceParentPath;
}
