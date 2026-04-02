import type {HeatmapGrid} from "./buildGrid";
import {parseISODateLocal, toISODateLocal} from "./dates";

/** Single-letter weekday labels matching `Date#getDay()` order Sun…Sat (Sat/Sun both `S`). */
const DOW_LETTER: readonly string[] = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Seven labels for heatmap rows (top = first day of week from settings).
 * Same convention as GitHub: M T W T F S S for a Monday-first week.
 */
export function dowAbbreviationsForRows(firstDayOfWeek: number): string[] {
	const out: string[] = [];
	for (let r = 0; r < 7; r++) {
		const jsDay = (firstDayOfWeek + r) % 7;
		out.push(DOW_LETTER[jsDay]);
	}
	return out;
}

/** Column index (0-based) where `d` appears in the grid, or -1. */
export function findColumnIndexForDate(grid: HeatmapGrid, d: Date): number {
	const key = toISODateLocal(d);
	for (let c = 0; c < grid.columns.length; c++) {
		for (const cell of grid.columns[c]) {
			if (cell.dateKey === key) return c;
		}
	}
	return -1;
}

export type MonthLabel = {
	/** Short month e.g. Jan, Feb */
	label: string;
	/** Week column where the 1st of that month falls (aligned to grid). */
	columnIndex: number;
};

/**
 * Month headers placed at the column containing the first day of each month in range
 * (rough GitHub-style alignment).
 */
export function computeMonthLabels(grid: HeatmapGrid, locale?: string): MonthLabel[] {
	const start = parseISODateLocal(grid.rangeStartKey);
	const end = parseISODateLocal(grid.rangeEndKey);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

	const fmt = new Intl.DateTimeFormat(locale ?? undefined, {month: "short"});
	const out: MonthLabel[] = [];

	let y = start.getFullYear();
	let mo = start.getMonth();
	const endY = end.getFullYear();
	const endMo = end.getMonth();

	for (;;) {
		if (y > endY || (y === endY && mo > endMo)) break;
		const firstOfMonth = new Date(y, mo, 1, 0, 0, 0, 0);
		const t0 = firstOfMonth.getTime();
		if (t0 >= start.getTime() && t0 <= end.getTime()) {
			const col = findColumnIndexForDate(grid, firstOfMonth);
			if (col >= 0) {
				out.push({label: fmt.format(firstOfMonth), columnIndex: col});
			}
		}
		mo++;
		if (mo > 11) {
			mo = 0;
			y++;
		}
	}

	return out;
}
