/** Calendar grid helpers (adapted from Fulcrum). */

export type ReposeCalendarViewMode = "month" | "week";

export function toISODate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
	const out = new Date(d);
	out.setDate(out.getDate() + n);
	return out;
}

export function startOfWeek(d: Date, weekStart: number): Date {
	const out = new Date(d);
	out.setHours(0, 0, 0, 0);
	const day = out.getDay();
	const diff = (day - weekStart + 7) % 7;
	out.setDate(out.getDate() - diff);
	return out;
}

export function gridStartDate(focal: Date, mode: ReposeCalendarViewMode, weekStart: number): Date {
	if (mode === "month") {
		const first = new Date(focal.getFullYear(), focal.getMonth(), 1);
		return startOfWeek(first, weekStart);
	}
	return startOfWeek(focal, weekStart);
}

export function daysInView(mode: ReposeCalendarViewMode): number {
	return mode === "month" ? 42 : 7;
}

export function gridDates(
	focal: Date,
	mode: ReposeCalendarViewMode,
	weekStart: number,
): { date: Date; isCurrentMonth: boolean }[] {
	const start = gridStartDate(focal, mode, weekStart);
	const count = daysInView(mode);
	const focalMonth = focal.getMonth();
	const out: { date: Date; isCurrentMonth: boolean }[] = [];
	for (let i = 0; i < count; i++) {
		const date = addDays(start, i);
		out.push({
			date,
			isCurrentMonth: mode === "week" ? true : date.getMonth() === focalMonth,
		});
	}
	return out;
}

export function formatMonthYear(d: Date): string {
	return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatWeekRange(start: Date, days: number): string {
	const end = addDays(start, days - 1);
	const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
	if (sameMonth) {
		return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.getDate()}, ${end.getFullYear()}`;
	}
	return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function formatDayShort(d: Date): string {
	return d.toLocaleDateString(undefined, { weekday: "short" });
}

export function formatDayNum(d: Date): number {
	return d.getDate();
}
