export function todayLocalISODate(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** Compare due date string (YYYY-MM-DD or partial) to today; overdue if before today. */
export function isOverdue(due: string | undefined, done: boolean): boolean {
	if (done || !due) return false;
	const t = todayLocalISODate();
	const norm = due.slice(0, 10);
	return norm < t;
}

export function isDueToday(due: string | undefined, done: boolean): boolean {
	if (done || !due) return false;
	const norm = due.slice(0, 10);
	return norm === todayLocalISODate();
}

/** True if `iso` is a calendar day on or after today (local), YYYY-MM-DD prefix. */
export function isISODateTodayOrFuture(iso: string | undefined): boolean {
	if (!iso?.trim()) return false;
	const norm = iso.slice(0, 10);
	if (norm.length < 10) return false;
	return norm >= todayLocalISODate();
}

/** YYYY-MM-DD prefix strictly after local today (not including tomorrow as “today”). */
export function isCalendarDayAfterToday(iso: string | undefined): boolean {
	if (!iso?.trim()) return false;
	const norm = iso.slice(0, 10);
	if (norm.length < 10) return false;
	if (Number.isNaN(Date.parse(norm + "T12:00:00"))) return false;
	return norm > todayLocalISODate();
}

/** Local midnight at the start of tomorrow. Instants ≥ this are excluded from “today and past” activity feeds. */
export function tomorrowMidnightLocalMs(): number {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

export function dayStartMs(d: Date = new Date()): number {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x.getTime();
}

/**
 * `isoDate` is YYYY-MM-DD (or longer). True if that **local** calendar day is within the next `days`
 * days starting today (inclusive). Uses date-string comparison, not `Date.parse("YYYY-MM-DD")`, because
 * the latter is UTC midnight and can shift to the previous local day west of UTC — which would exclude
 * “today’s” meetings from the dashboard week grid while `slice(0,10) === todayLocalISODate()` still counts them.
 */
export function isDateInUpcomingDays(isoDate: string | undefined, days: number): boolean {
	if (!isoDate) return false;
	const norm = isoDate.slice(0, 10);
	if (norm.length < 10) return false;
	if (Number.isNaN(Date.parse(norm + "T12:00:00"))) return false;
	const today = todayLocalISODate();
	const lastInclusive = addDaysIso(today, days - 1);
	return norm >= today && norm <= lastInclusive;
}

export function addDaysIso(isoDate: string, days: number): string {
	const d = new Date(isoDate.slice(0, 10) + "T12:00:00");
	d.setDate(d.getDate() + days);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** Whole calendar days from today to target (negative if past). */
export function daysUntilCalendar(iso: string | undefined): number | null {
	if (!iso) return null;
	const t = Date.parse(iso.slice(0, 10) + "T12:00:00");
	if (Number.isNaN(t)) return null;
	const now = new Date();
	now.setHours(12, 0, 0, 0);
	return Math.ceil((t - now.getTime()) / 86400000);
}

/** Whole calendar days since target date (0 = today, positive if target is in the past). */
export function daysSinceCalendar(iso: string | undefined): number | null {
	if (!iso) return null;
	const t = Date.parse(iso.slice(0, 10) + "T12:00:00");
	if (Number.isNaN(t)) return null;
	const now = new Date();
	now.setHours(12, 0, 0, 0);
	return Math.ceil((now.getTime() - t) / 86400000);
}

export function formatShortMonthDay(iso: string | undefined): string {
	if (!iso) return "";
	const t = Date.parse(iso.slice(0, 10) + "T12:00:00");
	if (Number.isNaN(t)) return iso.slice(0, 10);
	return new Intl.DateTimeFormat("en-US", {month: "short", day: "2-digit", year: "numeric"}).format(
		t,
	);
}

/** Local calendar day, same style as {@link formatShortMonthDay}, from file mtime (or any instant in ms). */
export function formatShortMonthDayFromMs(ms: number): string {
	const d = new Date(ms);
	const y = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return formatShortMonthDay(`${y}-${mo}-${day}`) || `${y}-${mo}-${day}`;
}

export function formatTrackedMinutesShort(n: number): string {
	if (n < 1) return "";
	if (n < 60) return `${n}m`;
	const h = Math.floor(n / 60);
	const m = n % 60;
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** For next-review offsets: overdue (negative) is red; due within a week is amber. */
export function urgencyColorForDays(days: number | null): string {
	if (days === null) return "var(--text-muted)";
	if (days < 0) return "var(--text-error)";
	if (days < 7) return "#f39c12";
	return "var(--text-muted)";
}
