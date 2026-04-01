/**
 * Calendar grid utilities for Fulcrum calendar view.
 * Mimics TaskNotes calendar structure: month, work week, week, 3-day, day.
 */

export type CalendarViewMode = "month" | "workWeek" | "week" | "threeDay" | "day";

/** Align `date` to the start of its week. `weekStart`: 0 = Sunday … 6 = Saturday (matches settings). */
export function getWeekStart(date: Date, weekStart: number): Date {
	const d = new Date(date);
	const day = d.getDay();
	const diff = (day - weekStart + 7) % 7;
	d.setDate(d.getDate() - diff);
	d.setHours(0, 0, 0, 0);
	return d;
}

export function addDays(d: Date, n: number): Date {
	const out = new Date(d);
	out.setDate(out.getDate() + n);
	return out;
}

export function daysInView(mode: CalendarViewMode): number {
	switch (mode) {
		case "month":
			return 42; // 6 weeks
		case "workWeek":
			return 5;
		case "week":
			return 7;
		case "threeDay":
			return 3;
		case "day":
			return 1;
		default:
			return 7;
	}
}

/** First date shown in the grid for the given mode and focal date. */
export function gridStartDate(focal: Date, mode: CalendarViewMode, weekStart: number): Date {
	const d = new Date(focal);
	d.setHours(0, 0, 0, 0);

	if (mode === "month") {
		const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
		return getWeekStart(firstOfMonth, weekStart);
	}

	if (mode === "workWeek" || mode === "week") {
		return getWeekStart(d, weekStart);
	}

	// threeDay, day: start at focal date
	return d;
}

/** Array of [date, isCurrentMonth?] for the visible grid. */
export function gridDates(
	focal: Date,
	mode: CalendarViewMode,
	weekStart: number,
): {date: Date; isCurrentMonth: boolean}[] {
	const start = gridStartDate(focal, mode, weekStart);
	const count = daysInView(mode);
	const out: {date: Date; isCurrentMonth: boolean}[] = [];
	const focalMonth = focal.getMonth();
	const focalYear = focal.getFullYear();

	for (let i = 0; i < count; i++) {
		const d = addDays(start, i);
		const isCurrentMonth = d.getMonth() === focalMonth && d.getFullYear() === focalYear;
		out.push({date: d, isCurrentMonth});
	}
	return out;
}

export function toISODate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function formatMonthYear(d: Date): string {
	return new Intl.DateTimeFormat("en-US", {month: "long", year: "numeric"}).format(d);
}

export function formatWeekRange(start: Date, count: number): string {
	const end = addDays(start, count - 1);
	const fmt = new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric", year: "numeric"});
	return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export function formatDayShort(d: Date): string {
	return new Intl.DateTimeFormat("en-US", {weekday: "short"}).format(d);
}

export function formatDayNum(d: Date): string {
	return String(d.getDate());
}

/** Work week: Mon=0..Fri=4. Other modes: 0..6. */
export function isWorkWeekDay(d: Date): boolean {
	const day = d.getDay();
	return day >= 1 && day <= 5;
}

/** Fractional minutes from local midnight (0–1440). */
export function localMinutesSinceMidnight(d: Date = new Date()): number {
	return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** Top position % for a “current time” line in the 24h day grid. */
export function timeGridNowLineTopPercent(d: Date = new Date()): number {
	return (localMinutesSinceMidnight(d) / (24 * 60)) * 100;
}
