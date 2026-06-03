import type {TaskSidebarSortBy, ProjectSidebarSortDir} from "../settingsDefaults";
import type {IndexedTask} from "../types";

function taskDueSortKey(t: IndexedTask): string {
	const d = t.dueDate?.slice(0, 10) ?? t.scheduledDate?.slice(0, 10);
	return d ?? "9999-99-99";
}

function taskProjectSortKey(t: IndexedTask): string {
	return (
		t.projectFile?.basename.replace(/\.md$/i, "") ??
		"\uffff"
	).toLowerCase();
}

export function sortIndexedTasks(
	tasks: IndexedTask[],
	sortBy: TaskSidebarSortBy,
	sortDir: ProjectSidebarSortDir,
): IndexedTask[] {
	const out = [...tasks];
	const dir = sortDir === "asc" ? 1 : -1;
	out.sort((a, b) => {
		let c = 0;
		switch (sortBy) {
			case "due":
				c = taskDueSortKey(a).localeCompare(taskDueSortKey(b));
				if (c === 0) c = a.title.localeCompare(b.title, undefined, {sensitivity: "base"});
				break;
			case "project":
				c = taskProjectSortKey(a).localeCompare(taskProjectSortKey(b));
				if (c === 0) c = a.title.localeCompare(b.title, undefined, {sensitivity: "base"});
				break;
			case "name":
			default:
				c = a.title.localeCompare(b.title, undefined, {sensitivity: "base"});
				break;
		}
		return c * dir;
	});
	return out;
}
