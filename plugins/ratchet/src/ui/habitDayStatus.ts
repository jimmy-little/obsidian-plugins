import type { TrackerConfig } from "../data/TrackerConfig";
import { isCheckOffHabit, isGoalMet } from "../data/TrackerConfig";

export type HabitDayStatus = "none" | "partial" | "complete" | "over";

/** Whether the day has any logged activity. */
export function dayHasActivity(count: number, eventCount: number): boolean {
	return eventCount > 0 || count !== 0;
}

/** Completion status for heatmap / calendar styling. */
export function habitDayStatus(
	tracker: TrackerConfig,
	count: number,
	eventCount: number,
	hasDoneMarker = false,
): HabitDayStatus {
	if (isCheckOffHabit(tracker)) {
		if (count > 0) return "over";
		return hasDoneMarker ? "complete" : "none";
	}
	if (!dayHasActivity(count, eventCount)) return "none";
	if (tracker.goalType === "none") return count > 0 ? "complete" : "none";
	if (tracker.goalType === "at most" && count > tracker.goal) return "over";
	if (isGoalMet(tracker, count)) return "complete";
	return "partial";
}

/** Map habit status to suite heatmap level: 0 empty, 2 partial, 4 complete. */
export function habitDayHeatLevel(
	tracker: TrackerConfig,
	count: number,
	eventCount: number,
	hasDoneMarker = false,
): 0 | 1 | 2 | 3 | 4 {
	const status = habitDayStatus(tracker, count, eventCount, hasDoneMarker);
	if (status === "none") return 0;
	if (status === "partial" || status === "over") return 2;
	return 4;
}
