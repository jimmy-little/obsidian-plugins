import {
	computeNextOccurrences,
	formatOccurrenceIso,
	isoDateOnly,
	nextOccurrenceAfter,
} from "../recurrence/recurrenceEngine";
import type {IndexedTask} from "../types";

/** Recurring parent task note (not a materialized occurrence child). */
export function isRecurringParentTask(task: IndexedTask): boolean {
	return (
		task.source === "taskNote" &&
		!!task.recurrence?.trim() &&
		!task.recurrenceParentPath
	);
}

/** Current due occurrence plus the next five future occurrences. */
export const HORIZON_RECURRING_OCCURRENCE_COUNT = 6;

function recurringOccurrenceSets(task: IndexedTask): {
	completeSet: Set<string>;
	skippedSet: Set<string>;
	scheduled: string | undefined;
} {
	const complete = task.completeInstances ?? [];
	const skipped = task.skippedInstances ?? [];
	return {
		completeSet: new Set(complete.map(isoDateOnly).filter(Boolean) as string[]),
		skippedSet: new Set(skipped.map(isoDateOnly).filter(Boolean) as string[]),
		scheduled: task.scheduledDate,
	};
}

/** The active occurrence date to complete or skip for a recurring parent task. */
export function resolveCurrentRecurringOccurrenceIso(task: IndexedTask): string | null {
	if (!isRecurringParentTask(task) || !task.recurrence?.trim()) return null;

	const {completeSet, skippedSet, scheduled} = recurringOccurrenceSets(task);
	const schedIso = isoDateOnly(scheduled);
	if (schedIso && !completeSet.has(schedIso) && !skippedSet.has(schedIso)) {
		return schedIso;
	}

	const upcoming = computeNextOccurrences(
		task.recurrence,
		scheduled,
		task.completeInstances ?? [],
		task.skippedInstances ?? [],
		1,
	);
	return upcoming[0] ?? null;
}

/**
 * Occurrence dates for a recurring task in Horizon: the current due instance
 * (scheduled when still open, otherwise the next computed match) and up to five
 * later instances.
 */
export function horizonRecurringOccurrenceDates(
	task: IndexedTask,
	today: string,
): string[] {
	if (!isRecurringParentTask(task) || !task.recurrence?.trim()) return [];

	const {completeSet, skippedSet, scheduled} = recurringOccurrenceSets(task);
	const schedIso = isoDateOnly(scheduled);
	const complete = task.completeInstances ?? [];
	const skipped = task.skippedInstances ?? [];

	const result: string[] = [];

	if (schedIso && !completeSet.has(schedIso) && !skippedSet.has(schedIso)) {
		result.push(schedIso);
	} else {
		const upcoming = computeNextOccurrences(
			task.recurrence,
			scheduled,
			complete,
			skipped,
			1,
		);
		if (upcoming[0]) result.push(upcoming[0]);
	}

	if (result.length === 0) return [];

	let cursor = new Date(`${result[0]!}T12:00:00`);
	while (result.length < HORIZON_RECURRING_OCCURRENCE_COUNT) {
		const next = nextOccurrenceAfter(
			task.recurrence,
			cursor,
			complete,
			skipped,
		);
		if (!next) break;
		const key = isoDateOnly(formatOccurrenceIso(next, scheduled));
		if (!key || result.includes(key)) break;
		result.push(key);
		cursor = new Date(next.getTime() + 60_000);
	}

	return result;
}

/** Scheduled/due display value for a recurring occurrence row. */
export function occurrenceScheduledIso(
	task: IndexedTask,
	occurrenceDateIso: string,
): string {
	const sched = task.scheduledDate;
	if (sched?.includes("T")) {
		const tMatch = sched.match(/T(\d{2}:\d{2}(?::\d{2})?)/);
		if (tMatch?.[1]) return `${occurrenceDateIso}T${tMatch[1]}`;
	}
	return occurrenceDateIso;
}
