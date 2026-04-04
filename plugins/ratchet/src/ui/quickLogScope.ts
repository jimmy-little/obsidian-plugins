import type { TrackerConfig } from "../data/TrackerConfig";
import { hasGoal } from "../data/TrackerConfig";
import { startOfDayLocal, startOfWeekLocal, startOfMonthLocal } from "../utils/DateUtils";

export type QuickLogScope = "day" | "week" | "month";

export const QUICK_SCOPE_LABELS: Record<QuickLogScope, string> = {
	day: "DAY",
	week: "WEEK",
	month: "MONTH",
};

const LS_KEY = "ratchet-quicklog-scope";

export function loadStoredQuickLogScope(): QuickLogScope {
	if (typeof localStorage === "undefined") return "day";
	try {
		const s = localStorage.getItem(LS_KEY);
		if (s === "day" || s === "week" || s === "month") return s;
	} catch {
		/* private mode */
	}
	return "day";
}

export function persistQuickLogScope(scope: QuickLogScope): void {
	try {
		localStorage.setItem(LS_KEY, scope);
	} catch {
		/* private mode */
	}
}

export function daysInMonthLocal(now: Date): number {
	return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

export function getScopeBounds(scope: QuickLogScope, now: Date, firstDayOfWeek: number): { start: Date; end: Date } {
	switch (scope) {
		case "day": {
			const start = startOfDayLocal(now);
			const end = new Date(start);
			end.setHours(23, 59, 59, 999);
			return { start, end };
		}
		case "week": {
			const start = startOfWeekLocal(now, firstDayOfWeek);
			const end = new Date(start);
			end.setDate(end.getDate() + 6);
			end.setHours(23, 59, 59, 999);
			return { start, end };
		}
		case "month": {
			const start = startOfMonthLocal(now);
			const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
			return { start, end };
		}
	}
}

/**
 * Target for the progress bar for the selected calendar scope; null = show count only (no fill).
 */
export function effectiveGoalForScope(t: TrackerConfig, scope: QuickLogScope, now: Date): number | null {
	if (!hasGoal(t) || t.goalType === "none") return null;
	const g = Math.max(0, t.goal);
	const dim = daysInMonthLocal(now);
	switch (t.resetPeriod) {
		case "daily":
			if (scope === "day") return g;
			if (scope === "week") return g * 7;
			return g * dim;
		case "weekly":
			if (scope === "week") return g;
			if (scope === "day") return g / 7;
			return g * (dim / 7);
		case "monthly":
			if (scope === "month") return g;
			if (scope === "week") return g * (7 / dim);
			return g / dim;
		case "yearly":
			if (scope === "month") return g / 12;
			if (scope === "week") return g / 52;
			return g / 365;
		case "never":
			return null;
	}
}

export function progressFillPercent(t: TrackerConfig, count: number, effectiveGoal: number | null): number {
	if (effectiveGoal == null) return 0;
	if (effectiveGoal <= 0) {
		if (t.goalType === "at most") return count === 0 ? 0 : 100;
		return 0;
	}
	return Math.min(100, Math.max(0, (count / effectiveGoal) * 100));
}

export function isScopeGoalMet(t: TrackerConfig, count: number, effectiveGoal: number | null): boolean {
	if (effectiveGoal == null) return false;
	if (t.goalType === "at least") return effectiveGoal <= 0 || count >= effectiveGoal;
	if (t.goalType === "at most") return count <= effectiveGoal;
	return false;
}
