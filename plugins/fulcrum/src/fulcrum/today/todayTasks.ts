import type {IndexedTask} from "../types";
import {isDoneStatus} from "../settingsDefaults";
import {isoDateOnly} from "../recurrence/recurrenceEngine";
import {
	horizonRecurringOccurrenceDates,
	isRecurringParentTask,
} from "../tasks/horizonRecurringOccurrences";
import {
	horizonTaskDedupeKey,
	taskPrimaryDateIso,
	type TasksViewDayEntry,
} from "../tasks/tasksViewModel";

export type TodayChecklist = {
	/** Tasks whose primary date is the focal day. */
	day: TasksViewDayEntry[];
	/** Open tasks with primary date before local today (same as Horizon Past due). */
	outstanding: IndexedTask[];
	/** Open tasks with no due/scheduled date (same as Horizon Unscheduled). */
	unscheduled: IndexedTask[];
};

function sameTask(a: IndexedTask, b: IndexedTask): boolean {
	return horizonTaskDedupeKey(a) === horizonTaskDedupeKey(b);
}

/**
 * Partition the shared open-task bucket for Today view.
 * Same membership rules as Horizon day sections: primary date → past / focal day / unscheduled.
 * Future-dated tasks are omitted (they appear under later Horizon days).
 */
export function collectTodayChecklist(
	tasks: IndexedTask[],
	focalIso: string,
	todayIso: string,
): TodayChecklist {
	const day: TasksViewDayEntry[] = [];
	const outstanding: IndexedTask[] = [];
	const unscheduled: IndexedTask[] = [];
	const outstandingSeen = new Set<string>();
	const unscheduledSeen = new Set<string>();

	const pushOutstanding = (task: IndexedTask): void => {
		const key = horizonTaskDedupeKey(task);
		if (outstandingSeen.has(key)) return;
		outstandingSeen.add(key);
		outstanding.push(task);
	};

	const pushUnscheduled = (task: IndexedTask): void => {
		const key = horizonTaskDedupeKey(task);
		if (unscheduledSeen.has(key)) return;
		unscheduledSeen.add(key);
		unscheduled.push(task);
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
		if (!iso) {
			pushUnscheduled(task);
			continue;
		}
		if (iso === focalIso) {
			day.push({task});
			continue;
		}
		if (iso < todayIso) pushOutstanding(task);
	}

	const dayKeys = new Set(day.map((e) => horizonTaskDedupeKey(e.task)));
	return {
		day,
		outstanding: outstanding.filter((t) => !dayKeys.has(horizonTaskDedupeKey(t))),
		unscheduled: unscheduled.filter((t) => !dayKeys.has(horizonTaskDedupeKey(t))),
	};
}

function dayEntryKey(entry: TasksViewDayEntry): string {
	return `${horizonTaskDedupeKey(entry.task)}:${entry.occurrenceDateIso ?? ""}`;
}

/**
 * Done work that still belongs on the focal day: due/scheduled that day, completed that day,
 * or a recurring occurrence marked complete that day. Open tasks are omitted.
 */
export function collectFocalDoneDayEntries(
	tasks: IndexedTask[],
	focalIso: string,
	doneStatuses: Set<string>,
): TasksViewDayEntry[] {
	const out: TasksViewDayEntry[] = [];
	const seen = new Set<string>();
	const push = (entry: TasksViewDayEntry): void => {
		const key = dayEntryKey(entry);
		if (seen.has(key)) return;
		seen.add(key);
		out.push(entry);
	};

	for (const task of tasks) {
		if (isRecurringParentTask(task)) {
			const completedToday = (task.completeInstances ?? []).some(
				(d) => isoDateOnly(d) === focalIso,
			);
			if (completedToday) push({task, occurrenceDateIso: focalIso});
			if (!isDoneStatus(task.status ?? "", doneStatuses)) continue;
			const primary = taskPrimaryDateIso(task);
			const completed = isoDateOnly(task.completedDate);
			if ((primary === focalIso || completed === focalIso) && !completedToday) {
				push({task, occurrenceDateIso: primary === focalIso ? focalIso : undefined});
			}
			continue;
		}

		if (!isDoneStatus(task.status ?? "", doneStatuses)) continue;
		const primary = taskPrimaryDateIso(task);
		const completed = isoDateOnly(task.completedDate);
		if (primary === focalIso || completed === focalIso) push({task});
	}

	return out;
}

/** Open focal-day rows plus done rows that were filtered out of the open bucket. */
export function mergeTodayDayEntries(
	openDay: TasksViewDayEntry[],
	doneDay: TasksViewDayEntry[],
): TasksViewDayEntry[] {
	const seen = new Set(openDay.map(dayEntryKey));
	const merged = [...openDay];
	for (const entry of doneDay) {
		const key = dayEntryKey(entry);
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(entry);
	}
	return merged;
}

export function checklistHasTask(list: TodayChecklist, task: IndexedTask): boolean {
	return (
		list.day.some((e) => sameTask(e.task, task)) ||
		list.outstanding.some((t) => sameTask(t, task)) ||
		list.unscheduled.some((t) => sameTask(t, task))
	);
}
