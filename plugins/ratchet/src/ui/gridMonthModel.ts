import type { RatchetEvent } from "../data/EventLog";
import type { TrackerConfig } from "../data/TrackerConfig";
import { hasGoal } from "../data/TrackerConfig";
import { startOfWeekLocal } from "../utils/DateUtils";

/** Calendar range covering all week-long windows that overlap this month (for weekly goals). */
export function monthWeekHistoryRange(
	year: number,
	monthIndex: number,
	firstDayOfWeek: number,
): { start: Date; end: Date } {
	const dim = daysInMonth(year, monthIndex);
	const first = new Date(year, monthIndex, 1);
	const last = new Date(year, monthIndex, dim, 23, 59, 59, 999);
	const wsFirst = startOfWeekLocal(first, firstDayOfWeek);
	const wsLast = startOfWeekLocal(last, firstDayOfWeek);
	const endExclusive = new Date(wsLast);
	endExclusive.setDate(endExclusive.getDate() + 7);
	return { start: wsFirst, end: new Date(endExclusive.getTime() - 1) };
}

export function daysInMonth(year: number, monthIndex: number): number {
	return new Date(year, monthIndex + 1, 0).getDate();
}

export function dayDate(year: number, monthIndex: number, dayOfMonth: number): Date {
	return new Date(year, monthIndex, dayOfMonth, 12, 0, 0, 0);
}

/** 0-based week band within month: days 1–7 → 0, 8–14 → 1, … */
export function monthWeekBand(dayOfMonth: number): number {
	return Math.floor((dayOfMonth - 1) / 7);
}

const DOW_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

export function dowInitial(year: number, monthIndex: number, dayOfMonth: number): string {
	const d = new Date(year, monthIndex, dayOfMonth);
	return DOW_LETTER[d.getDay()];
}

/** Per-day count and event count from month-scoped event list. */
export function detailByDayFromEvents(events: RatchetEvent[], year: number, monthIndex: number): Map<number, { count: number; eventCount: number }> {
	const dim = daysInMonth(year, monthIndex);
	const map = new Map<number, { count: number; eventCount: number }>();
	for (let d = 1; d <= dim; d++) map.set(d, { count: 0, eventCount: 0 });
	const ms = new Date(year, monthIndex, 1).getTime();
	const me = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).getTime();
	for (const e of events) {
		const t = new Date(e.timestamp).getTime();
		if (t < ms || t > me) continue;
		const dom = new Date(e.timestamp).getDate();
		const cur = map.get(dom)!;
		cur.count += e.value;
		cur.eventCount += 1;
		map.set(dom, cur);
	}
	return map;
}

export function sumByDayFromEvents(events: RatchetEvent[], year: number, monthIndex: number): Map<number, number> {
	const m = detailByDayFromEvents(events, year, monthIndex);
	const out = new Map<number, number>();
	for (const [k, v] of m) out.set(k, v.count);
	return out;
}

/** Mirrors DataManager.getGoalStatusForDay for a single day. */
export function goalStatusForDayFromDetail(
	tracker: TrackerConfig,
	count: number,
	eventCount: number,
): "met" | "not_met" | "no_data" {
	if (tracker.goalType === "none") return "no_data";
	if (eventCount === 0) return "no_data";
	const met =
		tracker.goalType === "at least"
			? tracker.goal <= 0 || count >= tracker.goal
			: count <= tracker.goal;
	return met ? "met" : "not_met";
}

export function dayProgressPercent(tracker: TrackerConfig, count: number): number {
	if (!hasGoal(tracker)) {
		return count > 0 ? 100 : 0;
	}
	if (tracker.goalType === "at least") {
		const g = Math.max(tracker.goal, 1);
		return Math.min(100, (count / g) * 100);
	}
	if (tracker.goal === 0) return count === 0 ? 100 : 0;
	return Math.min(100, (1 - Math.min(count, tracker.goal) / tracker.goal) * 100);
}

export function aggregateDayPercent(trackers: TrackerConfig[], counts: Map<string, Map<number, number>>, day: number): number {
	const withGoals = trackers.filter(hasGoal);
	if (withGoals.length === 0) {
		let any = 0;
		for (const t of trackers) {
			any += counts.get(t.id)?.get(day) ?? 0;
		}
		return any > 0 ? 100 : 0;
	}
	let sum = 0;
	for (const t of withGoals) {
		const c = counts.get(t.id)?.get(day) ?? 0;
		sum += dayProgressPercent(t, c);
	}
	return sum / withGoals.length;
}

export function overallMonthPercent(
	trackers: TrackerConfig[],
	counts: Map<string, Map<number, number>>,
	year: number,
	monthIndex: number,
): number {
	const dim = daysInMonth(year, monthIndex);
	if (dim === 0 || trackers.length === 0) return 0;
	let s = 0;
	for (let d = 1; d <= dim; d++) {
		s += aggregateDayPercent(trackers, counts, d);
	}
	return Math.round((s / dim) * 10) / 10;
}

export interface MonthStatColumn {
	goalLabel: string;
	percent: number;
	countLabel: string;
}

function weekStartsOverlappingMonth(year: number, monthIndex: number, firstDayOfWeek: number): Date[] {
	const dim = daysInMonth(year, monthIndex);
	const seen = new Set<string>();
	const out: Date[] = [];
	for (let d = 1; d <= dim; d++) {
		const dt = new Date(year, monthIndex, d);
		const ws = startOfWeekLocal(dt, firstDayOfWeek);
		const key = `${ws.getFullYear()}-${ws.getMonth()}-${ws.getDate()}`;
		if (!seen.has(key)) {
			seen.add(key);
			out.push(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate(), 0, 0, 0, 0));
		}
	}
	out.sort((a, b) => a.getTime() - b.getTime());
	return out;
}

export function computeMonthStatColumn(
	tracker: TrackerConfig,
	eventsInMonth: RatchetEvent[],
	eventsYear: RatchetEvent[] | null,
	/** For weekly: events spanning full week windows overlapping the month (not clipped to month). */
	eventsWeekSpan: RatchetEvent[] | null,
	detail: Map<number, { count: number; eventCount: number }>,
	year: number,
	monthIndex: number,
	firstDayOfWeek: number,
): MonthStatColumn {
	const dim = daysInMonth(year, monthIndex);
	const period = tracker.resetPeriod;

	if (period === "daily") {
		let met = 0;
		for (let d = 1; d <= dim; d++) {
			const row = detail.get(d) ?? { count: 0, eventCount: 0 };
			if (goalStatusForDayFromDetail(tracker, row.count, row.eventCount) === "met") met++;
		}
		const pct = dim > 0 ? Math.round((met / dim) * 1000) / 10 : 0;
		const goalDisp = tracker.goalType === "none" ? "—" : String(tracker.goal);
		return {
			goalLabel: goalDisp,
			percent: pct,
			countLabel: `${met}/${dim}`,
		};
	}

	if (period === "weekly") {
		const weekEv = eventsWeekSpan ?? eventsInMonth;
		const weekStarts = weekStartsOverlappingMonth(year, monthIndex, firstDayOfWeek);
		let metW = 0;
		for (const ws of weekStarts) {
			const we = new Date(ws);
			we.setDate(we.getDate() + 7);
			const wStart = ws.getTime();
			const wEnd = we.getTime();
			const sum = weekEv.filter((e) => {
				const t = new Date(e.timestamp).getTime();
				return t >= wStart && t < wEnd;
			}).reduce((s, e) => s + e.value, 0);
			if (tracker.goalType === "none") {
				if (sum > 0) metW++;
			} else if (tracker.goalType === "at least") {
				if (tracker.goal <= 0 || sum >= tracker.goal) metW++;
			} else {
				if (sum <= tracker.goal) metW++;
			}
		}
		const totalW = weekStarts.length;
		const pct = totalW > 0 ? Math.round((metW / totalW) * 1000) / 10 : 0;
		const goalDisp = tracker.goalType === "none" ? "—" : String(tracker.goal);
		return {
			goalLabel: goalDisp,
			percent: pct,
			countLabel: `${metW}/${totalW}`,
		};
	}

	if (period === "monthly") {
		const sum = eventsInMonth.reduce((s, e) => s + e.value, 0);
		if (tracker.goalType === "none") {
			return { goalLabel: "—", percent: 0, countLabel: String(sum) };
		}
		const pct =
			tracker.goalType === "at least"
				? Math.min(100, Math.round((sum / Math.max(tracker.goal, 1)) * 1000) / 10)
				: Math.min(100, Math.round((1 - Math.min(sum, tracker.goal) / Math.max(tracker.goal, 1)) * 1000) / 10);
		return {
			goalLabel: String(tracker.goal),
			percent: pct,
			countLabel: `${sum}/${tracker.goal}`,
		};
	}

	if (period === "yearly") {
		const evY = eventsYear ?? eventsInMonth;
		const yStart = new Date(year, 0, 1).getTime();
		const yEnd = new Date(year, 11, 31, 23, 59, 59, 999).getTime();
		const sum = evY.filter((e) => {
			const t = new Date(e.timestamp).getTime();
			return t >= yStart && t <= yEnd;
		}).reduce((s, e) => s + e.value, 0);
		if (tracker.goalType === "none") {
			return { goalLabel: "—", percent: 0, countLabel: String(sum) };
		}
		const pct =
			tracker.goalType === "at least"
				? Math.min(100, Math.round((sum / Math.max(tracker.goal, 1)) * 1000) / 10)
				: Math.min(100, Math.round((1 - Math.min(sum, tracker.goal) / Math.max(tracker.goal, 1)) * 1000) / 10);
		return {
			goalLabel: String(tracker.goal),
			percent: pct,
			countLabel: `${sum}/${tracker.goal}`,
		};
	}

	// never
	const sum = eventsInMonth.reduce((s, e) => s + e.value, 0);
	if (tracker.goalType === "none") {
		return { goalLabel: "—", percent: 0, countLabel: String(sum) };
	}
	const pct = Math.min(100, Math.round((sum / Math.max(tracker.goal, 1)) * 1000) / 10);
	return {
		goalLabel: String(tracker.goal),
		percent: pct,
		countLabel: `${sum}/${tracker.goal}`,
	};
}
