import type {FulcrumSettings} from "../settingsDefaults";
import {isDoneStatus} from "../settingsDefaults";
import type {IndexedPlannerEvent, IndexedTask, IndexSnapshot} from "../types";
import {
	type AreaFilterState,
	taskPassesAreaFilter,
} from "../utils/areaFocusFilter";
import {taskMatchesViewProjectFilter} from "../utils/viewProjectFilter";
import {
	filterOpenTasksForTasksView,
	horizonTaskDedupeKey,
	indexedTaskFromPlannerEvent,
} from "./tasksViewModel";

const INCLUDE_UNLINKED = {includeUnlinked: true as const};

/** Open (not done) tasks for board-style views. Includes unlinked tasks; no Horizon facet filters. */
export function collectOpenTasks(
	snapshot: IndexSnapshot,
	areaFilter: AreaFilterState,
	lifeModeMap: Map<string, string>,
	doneTask: Set<string>,
	selectedProjectPaths: Set<string> = new Set(),
): IndexedTask[] {
	return snapshot.tasks.filter(
		(t) =>
			!isDoneStatus(t.status, doneTask) &&
			taskPassesAreaFilter(t, snapshot, areaFilter, lifeModeMap, INCLUDE_UNLINKED) &&
			taskMatchesViewProjectFilter(t, selectedProjectPaths),
	);
}

/** Open tasks for Horizon views: area filter (incl. unlinked inline), facet filters, planner blocks. */
export function collectHorizonTasks(
	snapshot: IndexSnapshot,
	settings: FulcrumSettings,
	areaFilter: AreaFilterState,
	lifeModeMap: Map<string, string>,
	doneTask: Set<string>,
	selectedProjectPaths: Set<string> = new Set(),
): IndexedTask[] {
	const open = collectOpenTasks(snapshot, areaFilter, lifeModeMap, doneTask);
	const filtered = filterOpenTasksForTasksView(open, settings).filter((t) =>
		taskMatchesViewProjectFilter(t, selectedProjectPaths),
	);
	if (settings.taskSourceMode === "taskNotes") return filtered;

	const seen = new Set(filtered.map((t) => horizonTaskDedupeKey(t)));
	const merged = [...filtered];

	for (const ev of snapshot.plannerEvents ?? []) {
		if (isDoneStatus(ev.status, doneTask)) continue;
		const asTask = indexedTaskFromPlannerEvent(ev);
		if (!taskPassesAreaFilter(asTask, snapshot, areaFilter, lifeModeMap, INCLUDE_UNLINKED)) continue;
		if (!taskMatchesViewProjectFilter(asTask, selectedProjectPaths)) continue;
		if (filterOpenTasksForTasksView([asTask], settings).length === 0) continue;
		const key = horizonTaskDedupeKey(asTask);
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(asTask);
	}

	return merged;
}

export type {IndexedPlannerEvent};
