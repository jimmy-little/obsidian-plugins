export type ResetPeriod = "never" | "daily" | "weekly" | "monthly" | "yearly";

export const RESET_PERIOD_LABELS: Record<ResetPeriod, string> = {
	never: "Never",
	daily: "Daily",
	weekly: "Weekly",
	monthly: "Monthly",
	yearly: "Yearly",
};

/** "at least" = reach minimum (0 = bad); "at most" = stay under cap (0 = good when goal is 0); "none" = no goal */
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
	created: string; // ISO
	incrementButtons: number[]; // e.g. [1, 5, 10]
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
		created: overrides.created ?? now,
		incrementButtons: overrides.incrementButtons?.length ? overrides.incrementButtons : [1],
	};
}

/** Whether the tracker has an effective goal for display (goalType is set and goal is defined). */
export function hasGoal(t: TrackerConfig): boolean {
	return t.goalType !== "none" && (t.goalType === "at most" || t.goal > 0);
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
