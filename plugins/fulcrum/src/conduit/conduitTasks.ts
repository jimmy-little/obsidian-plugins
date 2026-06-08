import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import type {IndexedProject, IndexedTask} from "../fulcrum/types";
import {areaTagForProject, sanitizeRemctlTag} from "./projectMeta";

/**
 * Tasks eligible for Conduit push/pull.
 * - TaskNotes: indexed only when `type: task` (or task tag) in configured TaskNotes folders.
 * - Inline: must be linked to a project (not the Fulcrum Inbox catch-all for random checklists).
 */
export function isConduitEligibleTask(task: IndexedTask, _settings: FulcrumSettings): boolean {
	if (!task.title?.trim()) return false;
	if (task.source === "taskNote") return true;
	if (task.source === "inline") return task.projectFile != null;
	return false;
}

/** Tasks eligible for Conduit push/pull (inbox when no project on TaskNotes). */
export function conduitSyncTasks(
	tasks: IndexedTask[],
	settings: FulcrumSettings,
): IndexedTask[] {
	return tasks.filter((t) => isConduitEligibleTask(t, settings));
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
