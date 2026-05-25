import {addDays, getWeekStart, toISODate} from "../utils/calendarGrid";

export const DATE_BUCKET_IDS = [
	"past",
	"this_week",
	"next_week",
	"next_month",
	"future",
	"unscheduled",
] as const;

export type DateBucketId = (typeof DATE_BUCKET_IDS)[number];

export const DATE_BUCKET_LABELS: Record<DateBucketId, string> = {
	past: "Past",
	this_week: "This week",
	next_week: "Next week",
	next_month: "Next month",
	future: "Future",
	unscheduled: "Unscheduled",
};

function parseDateOnly(iso: string | undefined): Date | null {
	if (!iso?.trim()) return null;
	const norm = iso.trim().slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(norm)) return null;
	const d = new Date(`${norm}T12:00:00`);
	return Number.isNaN(d.getTime()) ? null : d;
}

export function dateBucketFor(
	iso: string | undefined,
	weekStartDay: number,
	now: Date = new Date(),
): DateBucketId {
	const d = parseDateOnly(iso);
	if (!d) return "unscheduled";

	const today = new Date(now);
	today.setHours(12, 0, 0, 0);
	const weekStart = getWeekStart(today, weekStartDay);
	const thisWeekEnd = addDays(weekStart, 7);
	const nextWeekEnd = addDays(weekStart, 14);

	const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0, 12, 0, 0, 0);

	if (d.getTime() < weekStart.getTime()) return "past";
	if (d.getTime() < thisWeekEnd.getTime()) return "this_week";
	if (d.getTime() < nextWeekEnd.getTime()) return "next_week";
	if (d.getTime() <= nextMonthEnd.getTime()) return "next_month";
	return "future";
}

/** Human-readable drop target date for Kanban date columns (e.g. "May 25"). */
export function formatDateBucketHint(
	bucketId: DateBucketId,
	weekStartDay: number,
	now: Date = new Date(),
): string | null {
	if (bucketId === "unscheduled") return "Clears date";
	const iso = representativeDateForBucket(bucketId, weekStartDay, now);
	if (!iso) return null;
	const d = new Date(`${iso}T12:00:00`);
	return d.toLocaleDateString(undefined, {month: "long", day: "numeric"});
}

export function representativeDateForBucket(
	bucketId: DateBucketId,
	weekStartDay: number,
	now: Date = new Date(),
): string | null {
	if (bucketId === "unscheduled") return null;

	const today = new Date(now);
	today.setHours(12, 0, 0, 0);
	const weekStart = getWeekStart(today, weekStartDay);

	switch (bucketId) {
		case "past": {
			const y = addDays(today, -1);
			return toISODate(y);
		}
		case "this_week":
			return toISODate(weekStart);
		case "next_week":
			return toISODate(addDays(weekStart, 7));
		case "next_month":
			return toISODate(addDays(weekStart, 14));
		case "future": {
			const afterNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 1, 12, 0, 0, 0);
			return toISODate(afterNextMonth);
		}
		default:
			return null;
	}
}
