import {addDays, getWeekStart, toISODate} from "./utils/calendarGrid";
import {addDaysIso, todayLocalISODate} from "./utils/dates";

export function scheduleTodayIso(): string {
	return todayLocalISODate();
}

export function scheduleTomorrowIso(): string {
	return addDaysIso(todayLocalISODate(), 1);
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
