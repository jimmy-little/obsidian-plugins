import {addDays, startOfLocalDay, startOfWeek, toISODateLocal} from "./dates";
import {countToLevel, DEFAULT_LEVEL_THRESHOLDS, relativeThresholds} from "./levels";

export type HeatmapCell = {
	/** Local `YYYY-MM-DD`. */
	dateKey: string;
	inRange: boolean;
	count: number;
	/** 0 = no activity in range; 1–4 = intensity. */
	level: 0 | 1 | 2 | 3 | 4;
};

export type HeatmapWeekColumn = readonly HeatmapCell[];

export type HeatmapGrid = {
	/** One column per week; oldest week first (left), newest last (right). */
	columns: HeatmapWeekColumn[];
	firstDayOfWeek: number;
	rangeStartKey: string;
	rangeEndKey: string;
};

export type BuildHeatmapOptions = {
	/** 0 = Sunday … 6 = Saturday. Default `0`. */
	firstDayOfWeek?: number;
	/**
	 * How far back from `today` the range starts (inclusive of both ends).
	 * Default `364` → **365** local days including today.
	 */
	daysBack?: number;
	/** Override “today” (tests). */
	today?: Date;
	/** Use `relativeThresholds` from max count in-range instead of fixed buckets. */
	intensity?: "fixed" | "relative";
	/** Custom fixed thresholds (ascending); default see `DEFAULT_LEVEL_THRESHOLDS`. */
	fixedThresholds?: readonly number[];
};

function toCountMap(input: ReadonlyMap<string, number> | Record<string, number>): Map<string, number> {
	if (input instanceof Map) return new Map(input);
	const m = new Map<string, number>();
	for (const [k, v] of Object.entries(input)) {
		const n = Number(v);
		if (!Number.isFinite(n) || n <= 0) continue;
		m.set(k, (m.get(k) ?? 0) + n);
	}
	return m;
}

/**
 * Build a ~52×7 GitHub-style grid: columns = weeks, rows = weekday (first row = first day of week).
 * Range: **today** back **daysBack** days (default 364 → 365 inclusive days).
 */
export function buildHeatmapGrid(
	counts: ReadonlyMap<string, number> | Record<string, number>,
	options?: BuildHeatmapOptions,
): HeatmapGrid {
	const fdow = options?.firstDayOfWeek ?? 0;
	const daysBack = options?.daysBack ?? 364;
	const today = startOfLocalDay(options?.today ?? new Date());
	const rangeEnd = today;
	const rangeStart = addDays(rangeEnd, -daysBack);
	const countsMap = toCountMap(counts);

	let thresholds: readonly number[] = options?.fixedThresholds ?? [...DEFAULT_LEVEL_THRESHOLDS];

	if (options?.intensity === "relative") {
		let max = 0;
		for (let d = new Date(rangeStart.getTime()); d.getTime() <= rangeEnd.getTime(); d = addDays(d, 1)) {
			const key = toISODateLocal(d);
			max = Math.max(max, countsMap.get(key) ?? 0);
		}
		thresholds = relativeThresholds(max);
	}

	const columns: HeatmapWeekColumn[] = [];
	let weekStart = startOfWeek(rangeStart, fdow);
	const lastWeekStart = startOfWeek(rangeEnd, fdow);

	while (weekStart.getTime() <= lastWeekStart.getTime()) {
		const col: HeatmapCell[] = [];
		for (let r = 0; r < 7; r++) {
			const cellDate = addDays(weekStart, r);
			const t = cellDate.getTime();
			const inRange = t >= rangeStart.getTime() && t <= rangeEnd.getTime();
			const dateKey = toISODateLocal(cellDate);
			const count = inRange ? (countsMap.get(dateKey) ?? 0) : 0;
			const level = inRange ? (countToLevel(count, thresholds) as 0 | 1 | 2 | 3 | 4) : 0;
			col.push({dateKey, inRange, count, level});
		}
		columns.push(col);
		weekStart = addDays(weekStart, 7);
	}

	return {
		columns,
		firstDayOfWeek: fdow,
		rangeStartKey: toISODateLocal(rangeStart),
		rangeEndKey: toISODateLocal(rangeEnd),
	};
}

/** Aggregate millisecond timestamps into local-day counts (for activity feeds, logs, etc.). */
export function countsFromTimestamps(timestampsMs: Iterable<number>): Map<string, number> {
	const m = new Map<string, number>();
	for (const ms of timestampsMs) {
		const key = toISODateLocal(new Date(ms));
		m.set(key, (m.get(key) ?? 0) + 1);
	}
	return m;
}
