import type { ProgramNote, SessionNote } from "./types";

/** Sun..Sat abbreviations — must match program schedule strings */
export const DAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface PlannedMark {
	programName: string;
	dayName: string;
}

export function daysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

export function formatMonthTitle(year: number, month: number): string {
	return new Date(year, month, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function toIsoDateLocal(year: number, month: number, day: number): string {
	return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Group sessions by `frontmatter.date` (YYYY-MM-DD). */
export function buildSessionsByDate(sessions: SessionNote[]): Map<string, SessionNote[]> {
	const map = new Map<string, SessionNote[]>();
	for (const s of sessions) {
		const d = s.frontmatter.date;
		if (!d) continue;
		if (!map.has(d)) map.set(d, []);
		map.get(d)!.push(s);
	}
	return map;
}

/**
 * For each day in the month, which program days are planned (active programs, schedule match).
 * Weekday-mapped: fixed mapping from schedule slot to program day.
 * Sequential: next day after last program session strictly before that calendar date.
 */
export function computePlannedForMonth(
	year: number,
	month: number,
	programs: ProgramNote[],
	allSessions: SessionNote[]
): Map<string, PlannedMark[]> {
	const result = new Map<string, PlannedMark[]>();
	const lastDay = daysInMonth(year, month);

	const activePrograms = programs.filter((p) => p.active && p.days.length > 0 && p.schedule.length > 0);

	for (const program of activePrograms) {
		const progSessions = allSessions
			.filter((s) => s.frontmatter.program === program.name)
			.sort((a, b) => a.frontmatter.date.localeCompare(b.frontmatter.date));

		for (let day = 1; day <= lastDay; day++) {
			const dateStr = toIsoDateLocal(year, month, day);
			const dt = new Date(year, month, day);
			const abbrev = DAY_ABBREVS[dt.getDay()];
			if (!program.schedule.includes(abbrev)) continue;

			let dayName: string;
			if (program.rotation === "weekday-mapped") {
				const idx = program.schedule.indexOf(abbrev);
				dayName = program.days[idx % program.days.length]!.name;
			} else {
				const before = progSessions.filter((s) => s.frontmatter.date < dateStr);
				let nextIdx = 0;
				if (before.length > 0) {
					const last = before[before.length - 1]!;
					const lastIdx = program.days.findIndex((d) => d.name === last.frontmatter.programDay);
					nextIdx = lastIdx >= 0 ? (lastIdx + 1) % program.days.length : 0;
				}
				dayName = program.days[nextIdx]!.name;
			}

			if (!result.has(dateStr)) result.set(dateStr, []);
			result.get(dateStr)!.push({ programName: program.name, dayName });
		}
	}
	return result;
}

/** Calendar grid: leading empty slots + one entry per day in month (value = day number or null). */
export function buildCalendarGridCells(year: number, month: number): (number | null)[] {
	const first = new Date(year, month, 1);
	const startPad = first.getDay();
	const n = daysInMonth(year, month);
	const cells: (number | null)[] = [];
	for (let i = 0; i < startPad; i++) cells.push(null);
	for (let d = 1; d <= n; d++) cells.push(d);
	return cells;
}
