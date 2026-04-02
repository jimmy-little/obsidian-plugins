/** Local calendar date as `YYYY-MM-DD` (no UTC shift). */
export function toISODateLocal(d: Date): string {
	const y = d.getFullYear();
	const m = d.getMonth() + 1;
	const day = d.getDate();
	return `${y}-${pad2(m)}-${pad2(day)}`;
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

export function startOfLocalDay(d: Date): Date {
	const x = new Date(d.getTime());
	x.setHours(0, 0, 0, 0);
	return x;
}

export function addDays(d: Date, n: number): Date {
	const x = new Date(d.getTime());
	x.setDate(x.getDate() + n);
	return x;
}

/** Parse local `YYYY-MM-DD` (no timezone shift). */
export function parseISODateLocal(key: string): Date {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
	if (!m) return new Date(NaN);
	return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

/**
 * Milliseconds for a **calendar** `YYYY-MM-DD` in the local zone at noon.
 * Use instead of `Date.parse("YYYY-MM-DD")`, which is specified as UTC midnight and maps to the
 * previous local day for most Americas/Europe timezones — breaking heatmaps and weekday bucketing.
 */
export function msFromLocalYMDDateOnlyString(s: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
	if (!m) return null;
	const y = Number(m[1]);
	const mo = Number(m[2]) - 1;
	const da = Number(m[3]);
	const d = new Date(y, mo, da, 12, 0, 0, 0);
	return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * First day of the calendar week containing `d`.
 * @param firstDayOfWeek 0 = Sunday … 6 = Saturday (matches `Date#getDay()`).
 */
export function startOfWeek(d: Date, firstDayOfWeek: number): Date {
	const x = startOfLocalDay(d);
	const day = x.getDay();
	const diff = (day - firstDayOfWeek + 7) % 7;
	x.setDate(x.getDate() - diff);
	return x;
}
