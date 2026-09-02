import type {IndexedProject, IndexedTask} from "../types";

/** When empty, all projects/tasks pass. Otherwise only matching project paths pass. */
export function taskMatchesViewProjectFilter(
	task: IndexedTask,
	selectedPaths: Set<string>,
): boolean {
	if (selectedPaths.size === 0) return true;
	const path = task.projectFile?.path;
	return path != null && selectedPaths.has(path);
}

export function projectMatchesViewProjectFilter(
	project: IndexedProject,
	selectedPaths: Set<string>,
): boolean {
	if (selectedPaths.size === 0) return true;
	return selectedPaths.has(project.file.path);
}
