export type ResetPeriod = "never" | "daily" | "weekly" | "monthly" | "yearly";

export const RESET_PERIOD_LABELS: Record<ResetPeriod, string> = {
	never: "Never",
	daily: "Daily",
	weekly: "Weekly",
	monthly: "Monthly",
	yearly: "Yearly",
};

/** "at least" = reach minimum; "at most" = stay under cap; "none" = no numeric goal */
export type GoalType = "at least" | "at most" | "none";

export interface TrackerConfig {
	id: string;
	name: string;
	icon: string;
	resetPeriod: ResetPeriod;
	color: string;
	unit: string;
	goal: number; // meaning depends on goalType
	goalType: GoalType;
	/** Done / not done each period — no count (e.g. workout, no caffeine). */
	checkOff?: boolean;
	/** Hidden from dashboard, quick log, and stats; still editable and can be restored. */
	archived?: boolean;
	created: string; // ISO
}

export interface RatchetConfigFile {
	version: string;
	trackers: Record<string, TrackerConfig>;
}

export const DEFAULT_TRACKER_COLOR = "#7c3aed";

export function makeTrackerId(name: string): string {
	return name
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-]/g, "");
}

export function createTracker(overrides: Partial<TrackerConfig> & { name: string }): TrackerConfig {
	const id = overrides.id ?? makeTrackerId(overrides.name);
	const now = new Date().toISOString();
	return {
		id,
		name: overrides.name,
		icon: overrides.icon ?? "📌",
		resetPeriod: overrides.resetPeriod ?? "daily",
		color: overrides.color ?? DEFAULT_TRACKER_COLOR,
		unit: overrides.unit ?? "",
		goal: overrides.goal ?? 0,
		goalType: overrides.goalType ?? "at least",
		checkOff: overrides.checkOff ?? false,
		archived: overrides.archived ?? false,
		created: overrides.created ?? now,
	};
}

/** Done / not done habit — explicit daily check-off, no count. */
export function isCheckOffHabit(t: TrackerConfig): boolean {
	return t.checkOff === true;
}

export function isTrackerArchived(t: TrackerConfig): boolean {
	return t.archived === true;
}

/** Target check-offs per reset period (minimum 1). */
export function checkOffGoalTarget(t: TrackerConfig): number {
	return Math.max(t.goal, 1);
}

export function isCheckOffPeriodMet(t: TrackerConfig, checkOffCount: number): boolean {
	return checkOffCount >= checkOffGoalTarget(t);
}

export function formatCheckOffGoalSummary(t: TrackerConfig): string {
	const period = RESET_PERIOD_LABELS[t.resetPeriod]?.toLowerCase() ?? t.resetPeriod;
	return `${checkOffGoalTarget(t)}× per ${period}`;
}

/** Whether the tracker has an effective goal for display (goalType is set and goal is defined). */
export function hasGoal(t: TrackerConfig): boolean {
	if (isCheckOffHabit(t)) return checkOffGoalTarget(t) > 0;
	return t.goalType !== "none" && (t.goalType === "at most" || t.goal > 0);
}

/** Daily habits included in the week-grid column aggregate. */
export function countsForDailyAggregate(t: TrackerConfig): boolean {
	if (isCheckOffHabit(t)) return true;
	return t.goalType !== "none";
}

/** Whether current value meets the goal (for "at least" current >= goal; for "at most" current <= goal). */
export function isGoalMet(t: TrackerConfig, current: number): boolean {
	if (t.goalType === "none") return false;
	if (t.goalType === "at least") return t.goal <= 0 || current >= t.goal;
	return current <= t.goal; // at most
}

/** Whether current value is over the cap (only for "at most"). */
export function isOverGoal(t: TrackerConfig, current: number): boolean {
	return t.goalType === "at most" && t.goal < current;
}
