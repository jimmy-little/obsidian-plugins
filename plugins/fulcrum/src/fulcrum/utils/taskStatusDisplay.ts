import type {FulcrumSettings} from "../settingsDefaults";
import {isDoneStatus, normalizeStatusKey, parseTaskStatusChoices} from "../settingsDefaults";
import type {IndexedTask} from "../types";

/** Resolved in-progress status id from settings (defaults to `in-progress`). */
export function resolveInProgressStatus(settings: FulcrumSettings): string | null {
	for (const st of parseTaskStatusChoices(settings)) {
		const k = normalizeStatusKey(st);
		if (k === "in-progress" || k === "inprogress" || k === "in_progress") {
			return st;
		}
	}
	return parseTaskStatusChoices(settings).find(
		(st) => normalizeStatusKey(st) === "in-progress",
	) ?? null;
}

export function taskIsInProgress(task: IndexedTask, settings: FulcrumSettings): boolean {
	const target = resolveInProgressStatus(settings);
	if (!target) return false;
	return normalizeStatusKey(task.status ?? "") === normalizeStatusKey(target);
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
