/**
 * All period boundaries and "current period" are in local time (no UTC).
 */

export function startOfDayLocal(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfWeekLocal(d: Date, firstDayOfWeek: number): Date {
	const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
	const diff = (day - firstDayOfWeek + 7) % 7;
	const start = new Date(d);
	start.setDate(d.getDate() - diff);
	return startOfDayLocal(start);
}

export function startOfMonthLocal(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfYearLocal(d: Date): Date {
	return new Date(d.getFullYear(), 0, 1);
}

export type ResetPeriod = "never" | "daily" | "weekly" | "monthly" | "yearly";

/**
 * Start of the current reset period for the tracker, in local time.
 */
export function getPeriodStart(period: ResetPeriod, now: Date, firstDayOfWeek: number): Date {
	switch (period) {
		case "never":
			return new Date(0); // beginning of time
		case "daily":
			return startOfDayLocal(now);
		case "weekly":
			return startOfWeekLocal(now, firstDayOfWeek);
		case "monthly":
			return startOfMonthLocal(now);
		case "yearly":
			return startOfYearLocal(now);
		default:
			return startOfDayLocal(now);
	}
}

/**
 * Whether the event (by its timestamp) falls within the current period.
 */
export function isInPeriod(eventTimestamp: string, period: ResetPeriod, now: Date, firstDayOfWeek: number): boolean {
	if (period === "never") return true;
	const eventDate = new Date(eventTimestamp);
	const periodStart = getPeriodStart(period, now, firstDayOfWeek);
	return eventDate.getTime() >= periodStart.getTime();
}

/**
 * Month key for event file: "YYYY-MM".
 */
export function getMonthKey(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}
