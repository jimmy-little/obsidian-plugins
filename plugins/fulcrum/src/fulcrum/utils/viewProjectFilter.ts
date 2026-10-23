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

/**
 * Horizon / Kanban / Time sidebars list "active" projects only. Open tasks can
 * still belong to other statuses (e.g. ONGOING). Union those indexed projects
 * so the filter list matches what the view already shows.
 */
export function includeProjectsReferencedByOpenTasks(
	listed: IndexedProject[],
	allProjects: IndexedProject[],
	tasks: IndexedTask[],
): IndexedProject[] {
	const have = new Set(listed.map((p) => p.file.path));
	const needed = new Set<string>();
	for (const task of tasks) {
		const path = task.projectFile?.path;
		if (path) needed.add(path);
	}
	if (needed.size === 0) return listed;
	const out = [...listed];
	for (const project of allProjects) {
		if (have.has(project.file.path)) continue;
		if (!needed.has(project.file.path)) continue;
		out.push(project);
		have.add(project.file.path);
	}
	return out;
}
