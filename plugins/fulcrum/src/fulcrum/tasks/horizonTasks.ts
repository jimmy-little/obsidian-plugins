import type {FulcrumSettings} from "../settingsDefaults";
import {isDoneStatus} from "../settingsDefaults";
import type {IndexedPlannerEvent, IndexedTask, IndexSnapshot} from "../types";
import {
	type AreaFilterState,
	taskPassesAreaFilter,
} from "../utils/areaFocusFilter";
import {
	filterOpenTasksForTasksView,
	horizonTaskDedupeKey,
	indexedTaskFromPlannerEvent,
} from "./tasksViewModel";

/** Open tasks for Horizon views: area filter (incl. unlinked inline), facet filters, planner blocks. */
export function collectHorizonTasks(
	snapshot: IndexSnapshot,
	settings: FulcrumSettings,
	areaFilter: AreaFilterState,
	lifeModeMap: Map<string, string>,
	doneTask: Set<string>,
): IndexedTask[] {
	const areaOpts = {includeUnlinked: true as const};
	const open = snapshot.tasks.filter(
		(t) =>
			!isDoneStatus(t.status, doneTask) &&
			taskPassesAreaFilter(t, snapshot, areaFilter, lifeModeMap, areaOpts),
	);
	const filtered = filterOpenTasksForTasksView(open, settings);
	if (settings.taskSourceMode === "taskNotes") return filtered;

	const seen = new Set(filtered.map((t) => horizonTaskDedupeKey(t)));
	const merged = [...filtered];

	for (const ev of snapshot.plannerEvents ?? []) {
		if (isDoneStatus(ev.status, doneTask)) continue;
		const asTask = indexedTaskFromPlannerEvent(ev);
		if (!taskPassesAreaFilter(asTask, snapshot, areaFilter, lifeModeMap, areaOpts)) continue;
		if (filterOpenTasksForTasksView([asTask], settings).length === 0) continue;
		const key = horizonTaskDedupeKey(asTask);
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(asTask);
	}

	return merged;
}

export type {IndexedPlannerEvent};
