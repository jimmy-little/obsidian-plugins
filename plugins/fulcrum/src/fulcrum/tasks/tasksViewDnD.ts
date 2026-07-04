import type {FulcrumHost} from "../pluginBridge";
import type {TasksViewGroupBy, TasksViewSection} from "./tasksViewModel";
import {
	FULCRUM_CALENDAR_TASK_MIME,
	findTaskByDragKey,
	waitForNextFileResolved,
} from "../calendar/calendarTaskSchedule";
import {
	applyTaskDueChange,
	applyTaskDueChangeToIso,
	applyTaskProjectChange,
	applyTaskTagAdd,
} from "../kanban/taskFieldUpdate";
import {NO_PROJECT} from "../kanban/buildBoard";
import type {IndexedTask} from "../types";

export async function handleTasksViewTaskDrop(
	host: FulcrumHost,
	task: IndexedTask,
	section: TasksViewSection,
	groupBy: TasksViewGroupBy,
): Promise<void> {
	const resolved = waitForNextFileResolved(host.app, task.file);
	try {
		if (groupBy === "day") {
			if (section.dropDateIso) {
				await applyTaskDueChangeToIso(host.app, task, host.settings, section.dropDateIso);
			} else if (section.key === "__unscheduled__") {
				await applyTaskDueChange(host.app, task, host.settings, null);
			}
		} else if (groupBy === "project") {
			const path = section.dropProjectPath ?? NO_PROJECT;
			await applyTaskProjectChange(
				host.app,
				task,
				host.settings,
				path,
				host.vaultIndex.getSnapshot().projects,
			);
		} else if (groupBy === "tag" && section.dropTag) {
			await applyTaskTagAdd(host.app, task, host.settings, section.dropTag);
		}
	} finally {
		await resolved;
		await host.refreshIndex();
	}
}

export async function handleTasksViewDateDrop(
	host: FulcrumHost,
	dataTransfer: DataTransfer,
	dateIso: string,
): Promise<boolean> {
	const raw = dataTransfer.getData(FULCRUM_CALENDAR_TASK_MIME);
	if (!raw) return false;
	const task = findTaskByDragKey(host.vaultIndex.getSnapshot().tasks, raw);
	if (!task) return false;
	const resolved = waitForNextFileResolved(host.app, task.file);
	try {
		await applyTaskDueChangeToIso(host.app, task, host.settings, dateIso);
	} finally {
		await resolved;
		await host.refreshIndex();
	}
	return true;
}

export function tasksViewDragOver(ev: DragEvent): void {
	if (ev.dataTransfer?.types.includes(FULCRUM_CALENDAR_TASK_MIME)) {
		ev.preventDefault();
		ev.dataTransfer.dropEffect = "move";
	}
}
