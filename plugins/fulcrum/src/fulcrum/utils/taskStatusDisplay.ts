import type {FulcrumSettings} from "../settingsDefaults";
import {
	isDoneStatus,
	normalizeStatusKey,
	parseBlockedStatusSet,
	parseTaskStatusChoices,
} from "../settingsDefaults";
import type {IndexedTask} from "../types";

/** Collapses spaces/hyphens/underscores so "IN PROGRESS", "in-progress", "in_progress", and
 *  "inprogress" are all treated as the same configured status token. */
function collapseSeparators(status: string): string {
	return normalizeStatusKey(status).replace(/[-_\s]+/g, "");
}

/** Resolved in-progress status id from settings (defaults to `in-progress`). */
export function resolveInProgressStatus(settings: FulcrumSettings): string | null {
	return parseTaskStatusChoices(settings).find((st) => collapseSeparators(st) === "inprogress") ?? null;
}

export function taskIsInProgress(task: IndexedTask, settings: FulcrumSettings): boolean {
	const target = resolveInProgressStatus(settings);
	if (!target) return false;
	return normalizeStatusKey(task.status ?? "") === normalizeStatusKey(target);
}

/** True when the task's status is in `taskBlockedStatuses` (e.g. "blocked"). */
export function taskIsBlocked(task: IndexedTask, settings: FulcrumSettings): boolean {
	const blockedSet = parseBlockedStatusSet(settings.taskBlockedStatuses);
	if (blockedSet.size === 0) return false;
	return blockedSet.has(normalizeStatusKey(task.status ?? ""));
}

export function taskIsOpenForTimerStart(
	task: IndexedTask,
	settings: FulcrumSettings,
	doneTask: Set<string>,
): boolean {
	const status = (task.status ?? "").trim();
	const yamlDone = settings.taskNoteYamlStatusDone.trim().toLowerCase();
	if (isDoneStatus(status, doneTask)) return false;
	if (yamlDone.length > 0 && normalizeStatusKey(status) === yamlDone) return false;
	return true;
}
