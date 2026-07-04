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

export type DashboardWeekSpan = "fullWeek" | "workWeek";
export type DashboardWeekAnchor = "startMonday" | "startToday";

const DASHBOARD_WEEK_SPAN_LS = "fulcrum-dashboard-week-span";
const DASHBOARD_WEEK_ANCHOR_LS = "fulcrum-dashboard-week-anchor";

export function loadDashboardWeekSpan(): DashboardWeekSpan {
	if (typeof localStorage === "undefined") return "fullWeek";
	return localStorage.getItem(DASHBOARD_WEEK_SPAN_LS) === "workWeek" ? "workWeek" : "fullWeek";
}

export function saveDashboardWeekSpan(span: DashboardWeekSpan): void {
	if (typeof localStorage === "undefined") return;
	localStorage.setItem(DASHBOARD_WEEK_SPAN_LS, span);
}

export function loadDashboardWeekAnchor(): DashboardWeekAnchor {
	if (typeof localStorage === "undefined") return "startMonday";
	return localStorage.getItem(DASHBOARD_WEEK_ANCHOR_LS) === "startToday"
		? "startToday"
		: "startMonday";
}

export function saveDashboardWeekAnchor(anchor: DashboardWeekAnchor): void {
	if (typeof localStorage === "undefined") return;
	localStorage.setItem(DASHBOARD_WEEK_ANCHOR_LS, anchor);
}

/** Advance `d` by `n` calendar weekdays (Mon–Fri); skips Sat/Sun. */
export function addWeekdays(d: Date, n: number): Date {
	let out = new Date(d);
	let remaining = Math.abs(n);
	const step = n >= 0 ? 1 : -1;
	while (remaining > 0) {
		out = addDays(out, step);
		if (isWorkWeekDay(out)) remaining--;
	}
	return out;
}

/** Collect `count` consecutive weekdays starting at `start` (inclusive). */
export function collectWeekdaysFrom(start: Date, count: number): Date[] {
	const out: Date[] = [];
	let d = new Date(start);
	d.setHours(0, 0, 0, 0);
	while (out.length < count) {
		if (isWorkWeekDay(d)) out.push(new Date(d));
		d = addDays(d, 1);
	}
	return out;
}

/** Dashboard meetings strip: visible days from span, anchor, and week offset. */
export function dashboardMeetingGridDates(opts: {
	span: DashboardWeekSpan;
	anchor: DashboardWeekAnchor;
	weekOffset: number;
	now?: Date;
}): Date[] {
	const today = new Date(opts.now ?? new Date());
	today.setHours(0, 0, 0, 0);
	const spanDays = opts.span === "workWeek" ? 5 : 7;

	if (opts.anchor === "startToday") {
		const start =
			opts.span === "workWeek"
				? addWeekdays(today, opts.weekOffset * spanDays)
				: addDays(today, opts.weekOffset * spanDays);
		if (opts.span === "workWeek") return collectWeekdaysFrom(start, spanDays);
		const out: Date[] = [];
		for (let i = 0; i < spanDays; i++) out.push(addDays(start, i));
		return out;
	}

	const focal = addDays(today, opts.weekOffset * 7);
	const weekStart = getWeekStart(focal, 1);
	if (opts.span === "workWeek") return collectWeekdaysFrom(weekStart, spanDays);
	const out: Date[] = [];
	for (let i = 0; i < spanDays; i++) out.push(addDays(weekStart, i));
	return out;
}
