import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {IndexedProject, IndexedTask} from "../fulcrum/types";
import {areaTagForProject, sanitizeRemctlTag} from "./projectMeta";

/** Tasks eligible for Conduit push/pull (inbox when no project). */
export function conduitSyncTasks(
	tasks: IndexedTask[],
	settings: FulcrumSettings,
): IndexedTask[] {
	return tasks.filter((t) => {
		if (!t.title?.trim()) return false;
		if (
			settings.taskIndexScope === "projectLinked" &&
			t.source === "inline" &&
			!t.projectFile
		) {
			return false;
		}
		return true;
	});
}

export function areaTagsForTask(
	task: IndexedTask,
	project: IndexedProject | null,
	settings: FulcrumSettings,
): string[] {
	if (!settings.conduitSyncAreaTags) return [];
	if (project) {
		const fromProject = areaTagForProject(project);
		if (fromProject) return [fromProject];
	}
	if (task.areaFile) {
		return [sanitizeRemctlTag(task.areaFile.basename.replace(/\.md$/i, ""))];
	}
	return [];
}
