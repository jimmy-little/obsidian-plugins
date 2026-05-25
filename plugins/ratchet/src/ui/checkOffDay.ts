import type { RatchetEvent } from "../data/EventLog";
import type { TrackerConfig } from "../data/TrackerConfig";
import { checkOffGoalTarget } from "../data/TrackerConfig";
import type { DataManager } from "../data/DataManager";
import { emptyDayDetail, type DayDetail } from "./gridMonthModel";

/** Toggle explicit done ↔ not done for a check-off habit on one calendar day. */
export async function toggleCheckOffDay(
	dm: DataManager,
	trackerId: string,
	date: Date,
	row: DayDetail,
): Promise<void> {
	if (row.count > 0) {
		await dm.clearEventsForTrackerOnDay(trackerId, date);
		return;
	}
	if (row.hasDoneMarker) {
		await dm.clearEventsForTrackerOnDay(trackerId, date);
		return;
	}
	await dm.incrementOnDate(trackerId, 0, date, "done");
}

export function checkOffDayDone(row: DayDetail): boolean {
	return row.hasDoneMarker && row.count <= 0;
}

function dayKeyFromTimestamp(ts: string): string {
	const d = new Date(ts);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** Number of days with an explicit check-off in an event list. */
export function countCheckOffsFromEvents(events: RatchetEvent[]): number {
	const byDay = new Map<string, DayDetail>();
	for (const e of events) {
		const key = dayKeyFromTimestamp(e.timestamp);
		const cur = byDay.get(key) ?? emptyDayDetail();
		cur.count += e.value;
		cur.eventCount += 1;
		if (e.value === 0) cur.hasDoneMarker = true;
		byDay.set(key, cur);
	}
	let n = 0;
	for (const row of byDay.values()) {
		if (checkOffDayDone(row)) n++;
	}
	return n;
}

export function countCheckOffsInDayDetail(detail: Map<number, DayDetail>): number {
	let n = 0;
	for (const row of detail.values()) {
		if (checkOffDayDone(row)) n++;
	}
	return n;
}

export function countCheckOffsFromDayEntries(
	entries: { count: number; eventCount: number; hasDoneMarker: boolean }[],
): number {
	let n = 0;
	for (const e of entries) {
		if (checkOffDayDone(e)) n++;
	}
	return n;
}

export function checkOffPeriodPercent(tracker: TrackerConfig, checkOffCount: number): number {
	const g = checkOffGoalTarget(tracker);
	return Math.min(100, Math.round((checkOffCount / g) * 100));
}
