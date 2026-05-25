import type { DataManager } from "../data/DataManager";
import type { TrackerConfig } from "../data/TrackerConfig";
import { isCheckOffHabit } from "../data/TrackerConfig";
import { checkOffPeriodPercent } from "./checkOffDay";
import { goalStatusForDayFromDetail, emptyDayDetail, type DayDetail } from "./gridMonthModel";
import { habitDayStatus } from "./habitDayStatus";

function dateKeyLocal(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function entryToDayDetail(e: { count: number; eventCount: number; hasDoneMarker: boolean }): DayDetail {
	return { count: e.count, eventCount: e.eventCount, hasDoneMarker: e.hasDoneMarker };
}

/** Rolling 7-day completion % (days with goal met / 7), matching dashboard cards. */
export async function computeWeekCompletePercent(
	dm: DataManager,
	tracker: TrackerConfig,
	today: Date = new Date(),
): Promise<number> {
	if (isCheckOffHabit(tracker) && tracker.resetPeriod !== "daily") {
		const count = await dm.getCurrentCount(tracker.id);
		return checkOffPeriodPercent(tracker, count);
	}

	const weekStart = new Date(today);
	weekStart.setDate(weekStart.getDate() - 6);
	weekStart.setHours(0, 0, 0, 0);
	const weekEntries = await dm.getDayEntries(tracker.id, weekStart, today);
	const entryByKey = new Map(weekEntries.map((e) => [e.dateKey, e]));

	let metDays = 0;
	for (let i = 0; i < 7; i++) {
		const d = new Date(weekStart);
		d.setDate(d.getDate() + i);
		const row = entryByKey.get(dateKeyLocal(d));
		const detail = row ? entryToDayDetail(row) : emptyDayDetail();

		if (isCheckOffHabit(tracker)) {
			if (goalStatusForDayFromDetail(tracker, detail) === "met") metDays++;
			continue;
		}
		if (row && habitDayStatus(tracker, row.count, row.eventCount, row.hasDoneMarker) === "complete") {
			metDays++;
		}
	}
	return Math.round((metDays / 7) * 100);
}

export function formatWeekCompleteSubtitle(percent: number): string {
	return `${percent}% this week`;
}
