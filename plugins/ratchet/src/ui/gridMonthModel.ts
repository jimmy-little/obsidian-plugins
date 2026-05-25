import type { RatchetEvent } from "../data/EventLog";
import type { TrackerConfig } from "../data/TrackerConfig";
import { countsForDailyAggregate, hasGoal, isCheckOffHabit, isCheckOffPeriodMet, checkOffGoalTarget } from "../data/TrackerConfig";
import { countCheckOffsFromEvents, checkOffPeriodPercent } from "./checkOffDay";
import { startOfDayLocal, startOfWeekLocal } from "../utils/DateUtils";

export interface DayDetail {
	count: number;
	eventCount: number;
	hasDoneMarker: boolean;
}

export function emptyDayDetail(): DayDetail {
	return { count: 0, eventCount: 0, hasDoneMarker: false };
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function weekDateKey(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function parseWeekDateKey(key: string): Date | null {
	const [y, m, d] = key.split("-").map(Number);
	if (!y || !m || !d) return null;
	return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function resolveGridWeekStart(storedKey: string | undefined, firstDayOfWeek: number): Date {
	const parsed = storedKey ? parseWeekDateKey(storedKey) : null;
	if (parsed) return parsed;
	return startOfWeekLocal(new Date(), firstDayOfWeek);
}

export function weekDates(weekStart: Date): Date[] {
	const out: Date[] = [];
	for (let i = 0; i < 7; i++) {
		const d = new Date(weekStart);
		d.setDate(d.getDate() + i);
		out.push(d);
	}
	return out;
}

export function formatWeekTitle(weekStart: Date): string {
	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekEnd.getDate() + 6);
	const sy = weekStart.getFullYear();
	const ey = weekEnd.getFullYear();
	const sm = weekStart.getMonth();
	const em = weekEnd.getMonth();
	if (sm === em && sy === ey) {
		return `${MONTH_SHORT[sm]} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${sy}`;
	}
	if (sy === ey) {
		return `${MONTH_SHORT[sm]} ${weekStart.getDate()} – ${MONTH_SHORT[em]} ${weekEnd.getDate()}, ${sy}`;
	}
	return `${MONTH_SHORT[sm]} ${weekStart.getDate()}, ${sy} – ${MONTH_SHORT[em]} ${weekEnd.getDate()}, ${ey}`;
}

/** Per-day count and event count for a 7-day window (index 0 = weekStart). */
export function detailByDayIndexFromEvents(
	events: RatchetEvent[],
	weekStart: Date,
): Map<number, DayDetail> {
	const map = new Map<number, DayDetail>();
	for (let i = 0; i < 7; i++) map.set(i, emptyDayDetail());
	const startMs = startOfDayLocal(weekStart).getTime();
	const endMs = startMs + 7 * 24 * 60 * 60 * 1000;
	for (const e of events) {
		const t = new Date(e.timestamp).getTime();
		if (t < startMs || t >= endMs) continue;
		const idx = Math.floor((startOfDayLocal(new Date(e.timestamp)).getTime() - startMs) / (24 * 60 * 60 * 1000));
		if (idx < 0 || idx > 6) continue;
		const cur = map.get(idx)!;
		cur.count += e.value;
		cur.eventCount += 1;
		if (e.value === 0) cur.hasDoneMarker = true;
		map.set(idx, cur);
	}
	return map;
}

export function sumByDayIndexFromEvents(events: RatchetEvent[], weekStart: Date): Map<number, number> {
	const m = detailByDayIndexFromEvents(events, weekStart);
	const out = new Map<number, number>();
	for (const [k, v] of m) out.set(k, v.count);
	return out;
}

export function overallWeekPercent(
	trackers: TrackerConfig[],
	details: Map<string, Map<number, DayDetail>>,
): number {
	if (trackers.length === 0) return 0;
	let s = 0;
	for (let d = 0; d < 7; d++) s += aggregateDayPercent(trackers, details, d);
	return Math.round((s / 7) * 10) / 10;
}

export function computeWeekStatColumn(
	tracker: TrackerConfig,
	eventsInWeek: RatchetEvent[],
	eventsInMonth: RatchetEvent[],
	eventsYear: RatchetEvent[] | null,
	detail: Map<number, DayDetail>,
	weekStart: Date,
	firstDayOfWeek: number,
): MonthStatColumn {
	const period = tracker.resetPeriod;

	if (period === "daily") {
		let met = 0;
		for (let d = 0; d < 7; d++) {
			const row = detail.get(d) ?? emptyDayDetail();
			if (goalStatusForDayFromDetail(tracker, row) === "met") met++;
		}
		const pct = Math.round((met / 7) * 1000) / 10;
		const g = checkOffGoalTarget(tracker);
		const goalDisp = isCheckOffHabit(tracker) ? String(g) : tracker.goalType === "none" ? "—" : String(tracker.goal);
		return { goalLabel: goalDisp, percent: pct, countLabel: `${met}/7` };
	}

	if (period === "weekly") {
		if (isCheckOffHabit(tracker)) {
			const count = countCheckOffsFromEvents(eventsInWeek);
			const g = checkOffGoalTarget(tracker);
			const pct = checkOffPeriodPercent(tracker, count);
			return { goalLabel: String(g), percent: pct, countLabel: `${count}/${g}` };
		}
		const sum = eventsInWeek.reduce((s, e) => s + e.value, 0);
		let met = false;
		if (tracker.goalType === "none") {
			met = sum > 0;
		} else if (tracker.goalType === "at least") {
			met = tracker.goal <= 0 || sum >= tracker.goal;
		} else {
			met = sum <= tracker.goal;
		}
		let pct = 0;
		if (tracker.goalType === "none") {
			pct = sum > 0 ? 100 : 0;
		} else if (tracker.goalType === "at least") {
			pct = met ? 100 : Math.min(100, Math.round((sum / Math.max(tracker.goal, 1)) * 1000) / 10);
		} else {
			pct = met ? 100 : Math.min(100, Math.round((sum / Math.max(tracker.goal, 1)) * 1000) / 10);
		}
		const goalDisp = tracker.goalType === "none" ? "—" : String(tracker.goal);
		return { goalLabel: goalDisp, percent: pct, countLabel: met ? "1/1" : "0/1" };
	}

	if (period === "monthly") {
		const y = weekStart.getFullYear();
		const m = weekStart.getMonth();
		return computeMonthStatColumn(
			tracker,
			eventsInMonth,
			null,
			null,
			detailByDayFromEvents(eventsInMonth, y, m),
			y,
			m,
			firstDayOfWeek,
		);
	}

	if (period === "yearly") {
		const y = weekStart.getFullYear();
		const m = weekStart.getMonth();
		return computeMonthStatColumn(
			tracker,
			eventsInMonth,
			eventsYear,
			null,
			detailByDayFromEvents(eventsInMonth, y, m),
			y,
			m,
			firstDayOfWeek,
		);
	}

	const sum = eventsInWeek.reduce((s, e) => s + e.value, 0);
	if (tracker.goalType === "none") {
		return { goalLabel: "—", percent: 0, countLabel: String(sum) };
	}
	const pct = Math.min(100, Math.round((sum / Math.max(tracker.goal, 1)) * 1000) / 10);
	return { goalLabel: String(tracker.goal), percent: pct, countLabel: `${sum}/${tracker.goal}` };
}

export function dowInitialForDate(d: Date): string {
	return DOW_LETTER[d.getDay()];
}

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
export function detailByDayFromEvents(events: RatchetEvent[], year: number, monthIndex: number): Map<number, DayDetail> {
	const dim = daysInMonth(year, monthIndex);
	const map = new Map<number, DayDetail>();
	for (let d = 1; d <= dim; d++) map.set(d, emptyDayDetail());
	const ms = new Date(year, monthIndex, 1).getTime();
	const me = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).getTime();
	for (const e of events) {
		const t = new Date(e.timestamp).getTime();
		if (t < ms || t > me) continue;
		const dom = new Date(e.timestamp).getDate();
		const cur = map.get(dom)!;
		cur.count += e.value;
		cur.eventCount += 1;
		if (e.value === 0) cur.hasDoneMarker = true;
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
	row: DayDetail,
): "met" | "not_met" | "no_data" {
	if (isCheckOffHabit(tracker)) {
		if (row.count > 0) return "not_met";
		return row.hasDoneMarker ? "met" : "not_met";
	}
	if (tracker.goalType === "none") return "no_data";
	if (row.eventCount === 0) return "no_data";
	const met =
		tracker.goalType === "at least"
			? row.count >= tracker.goal
			: row.count <= tracker.goal;
	return met ? "met" : "not_met";
}

export function dayProgressPercent(tracker: TrackerConfig, row: DayDetail): number {
	const status = goalStatusForDayFromDetail(tracker, row);
	if (status === "met") return 100;
	if (status === "no_data") return 0;
	return 0;
}

/** Trackers that belong in per-day column progress bars (daily reset only). */
export function trackersForDailyColumn(trackers: TrackerConfig[]): TrackerConfig[] {
	return trackers.filter((t) => t.resetPeriod === "daily");
}

export function aggregateDayPercent(
	trackers: TrackerConfig[],
	details: Map<string, Map<number, DayDetail>>,
	day: number,
): number {
	const daily = trackersForDailyColumn(trackers).filter(countsForDailyAggregate);
	if (daily.length === 0) return 0;

	let sum = 0;
	for (const t of daily) {
		const row = details.get(t.id)?.get(day) ?? emptyDayDetail();
		sum += goalStatusForDayFromDetail(t, row) === "met" ? 100 : 0;
	}
	return sum / daily.length;
}

export function overallMonthPercent(
	trackers: TrackerConfig[],
	details: Map<string, Map<number, DayDetail>>,
	year: number,
	monthIndex: number,
): number {
	const dim = daysInMonth(year, monthIndex);
	if (dim === 0 || trackers.length === 0) return 0;
	let s = 0;
	for (let d = 1; d <= dim; d++) {
		s += aggregateDayPercent(trackers, details, d);
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
	detail: Map<number, DayDetail>,
	year: number,
	monthIndex: number,
	firstDayOfWeek: number,
): MonthStatColumn {
	const dim = daysInMonth(year, monthIndex);
	const period = tracker.resetPeriod;

	if (period === "daily") {
		let met = 0;
		for (let d = 1; d <= dim; d++) {
			const row = detail.get(d) ?? emptyDayDetail();
			if (goalStatusForDayFromDetail(tracker, row) === "met") met++;
		}
		const pct = dim > 0 ? Math.round((met / dim) * 1000) / 10 : 0;
		const g = checkOffGoalTarget(tracker);
		const goalDisp = isCheckOffHabit(tracker) ? String(g) : tracker.goalType === "none" ? "—" : String(tracker.goal);
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
			const weekEvents = weekEv.filter((e) => {
				const t = new Date(e.timestamp).getTime();
				return t >= wStart && t < wEnd;
			});
			if (isCheckOffHabit(tracker)) {
				const count = countCheckOffsFromEvents(weekEvents);
				if (isCheckOffPeriodMet(tracker, count)) metW++;
			} else {
				const sum = weekEvents.reduce((s, e) => s + e.value, 0);
				if (tracker.goalType === "none") {
					if (sum > 0) metW++;
				} else if (tracker.goalType === "at least") {
					if (tracker.goal <= 0 || sum >= tracker.goal) metW++;
				} else {
					if (sum <= tracker.goal) metW++;
				}
			}
		}
		const totalW = weekStarts.length;
		const pct = totalW > 0 ? Math.round((metW / totalW) * 1000) / 10 : 0;
		const goalDisp = isCheckOffHabit(tracker)
			? String(checkOffGoalTarget(tracker))
			: tracker.goalType === "none"
				? "—"
				: String(tracker.goal);
		return {
			goalLabel: goalDisp,
			percent: pct,
			countLabel: `${metW}/${totalW}`,
		};
	}

	if (period === "monthly") {
		if (isCheckOffHabit(tracker)) {
			const count = countCheckOffsFromEvents(eventsInMonth);
			const g = checkOffGoalTarget(tracker);
			const pct = checkOffPeriodPercent(tracker, count);
			return { goalLabel: String(g), percent: pct, countLabel: `${count}/${g}` };
		}
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
		const yearEvents = evY.filter((e) => {
			const t = new Date(e.timestamp).getTime();
			return t >= yStart && t <= yEnd;
		});
		if (isCheckOffHabit(tracker)) {
			const count = countCheckOffsFromEvents(yearEvents);
			const g = checkOffGoalTarget(tracker);
			const pct = checkOffPeriodPercent(tracker, count);
			return { goalLabel: String(g), percent: pct, countLabel: `${count}/${g}` };
		}
		const sum = yearEvents.reduce((s, e) => s + e.value, 0);
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
	const sum = isCheckOffHabit(tracker)
		? countCheckOffsFromEvents(eventsInMonth)
		: eventsInMonth.reduce((s, e) => s + e.value, 0);
	if (isCheckOffHabit(tracker)) {
		const g = checkOffGoalTarget(tracker);
		const pct = checkOffPeriodPercent(tracker, sum);
		return { goalLabel: String(g), percent: pct, countLabel: `${sum}/${g}` };
	}
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
