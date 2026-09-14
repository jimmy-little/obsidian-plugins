import {addDays, getWeekStart, toISODate} from "./utils/calendarGrid";

export type TaskDatePresetId = "today" | "tomorrow" | "weekend" | "nextWeek";

export const TASK_DATE_PRESETS: {id: TaskDatePresetId; title: string}[] = [
	{id: "today", title: "Today"},
	{id: "tomorrow", title: "Tomorrow"},
	{id: "weekend", title: "This weekend"},
	{id: "nextWeek", title: "Next week"},
];

export function scheduleTodayIso(now: Date = new Date()): string {
	const d = new Date(now);
	d.setHours(12, 0, 0, 0);
	return toISODate(d);
}

export function scheduleTomorrowIso(now: Date = new Date()): string {
	const d = new Date(now);
	d.setHours(12, 0, 0, 0);
	d.setDate(d.getDate() + 1);
	return toISODate(d);
}

/** Upcoming Saturday, or today if already Sat/Sun. */
export function scheduleThisWeekendIso(now: Date = new Date()): string {
	const d = new Date(now);
	d.setHours(12, 0, 0, 0);
	const day = d.getDay();
	if (day === 0 || day === 6) return toISODate(d);
	d.setDate(d.getDate() + (6 - day));
	return toISODate(d);
}

/** First day of the next calendar week (per `weekStartDay`). */
export function scheduleNextWeekIso(weekStartDay: number, now: Date = new Date()): string {
	const d = new Date(now);
	d.setHours(12, 0, 0, 0);
	const weekStart = getWeekStart(d, weekStartDay);
	return toISODate(addDays(weekStart, 7));
}

export function isoForTaskDatePreset(
	id: TaskDatePresetId,
	weekStartDay: number,
	now: Date = new Date(),
): string {
	switch (id) {
		case "today":
			return scheduleTodayIso(now);
		case "tomorrow":
			return scheduleTomorrowIso(now);
		case "weekend":
			return scheduleThisWeekendIso(now);
		case "nextWeek":
			return scheduleNextWeekIso(weekStartDay, now);
	}
}
