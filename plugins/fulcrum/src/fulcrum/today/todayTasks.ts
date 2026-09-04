import type {IndexedTask} from "../types";
import {
	horizonRecurringOccurrenceDates,
	isRecurringParentTask,
} from "../tasks/horizonRecurringOccurrences";
import {horizonTaskDedupeKey, taskPrimaryDateIso, type TasksViewDayEntry} from "../tasks/tasksViewModel";
import {taskIsPastOpen} from "../utils/dates";

export type TodayChecklist = {
	day: TasksViewDayEntry[];
	outstanding: IndexedTask[];
};

function sameTask(a: IndexedTask, b: IndexedTask): boolean {
	return horizonTaskDedupeKey(a) === horizonTaskDedupeKey(b);
}

/** Open tasks for the focal day, plus overdue items relative to local today. */
export function collectTodayChecklist(
	tasks: IndexedTask[],
	focalIso: string,
	todayIso: string,
): TodayChecklist {
	const day: TasksViewDayEntry[] = [];
	const outstanding: IndexedTask[] = [];
	const outstandingSeen = new Set<string>();

	const pushOutstanding = (task: IndexedTask): void => {
		const key = horizonTaskDedupeKey(task);
		if (outstandingSeen.has(key)) return;
		outstandingSeen.add(key);
		outstanding.push(task);
	};

	for (const task of tasks) {
		if (isRecurringParentTask(task)) {
			for (const [idx, iso] of horizonRecurringOccurrenceDates(task, todayIso).entries()) {
				if (iso === focalIso) {
					day.push({task, occurrenceDateIso: iso, isGhostOccurrence: idx > 0});
				} else if (iso < todayIso) {
					pushOutstanding(task);
				}
			}
			continue;
		}

		const iso = taskPrimaryDateIso(task);
		if (iso === focalIso) {
			day.push({task});
			continue;
		}
		if (taskIsPastOpen(task, todayIso)) pushOutstanding(task);
	}

	const dayKeys = new Set(day.map((e) => horizonTaskDedupeKey(e.task)));
	return {
		day,
		outstanding: outstanding.filter((t) => !dayKeys.has(horizonTaskDedupeKey(t))),
	};
}

export function checklistHasTask(list: TodayChecklist, task: IndexedTask): boolean {
	return list.day.some((e) => sameTask(e.task, task)) || list.outstanding.some((t) => sameTask(t, task));
}
