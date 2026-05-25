import { getStatsNotePath } from "../import/parsers";
import type { BodyCompDay } from "../stats/bodyCompTypes";
import type { NutritionMealEntry } from "../nutrition/types";
import type { WorkoutListEntry } from "../workout/types";
import { HOME_TIMELINE_DAYS } from "../workout/workoutListUi";

export type HomeTimelineKind = "workout" | "nutrition" | "bodyComp";

export interface HomeTimelineItem {
	kind: HomeTimelineKind;
	date: string;
	/** HH:mm or ISO timestamp for chronological sort within a day. */
	sortTime: string;
	title: string;
	meta?: string;
	workoutPath?: string;
	iconName?: string;
	meal?: NutritionMealEntry;
	bodyComp?: BodyCompDay;
	statsNotePath?: string;
}

export interface HomeTimelineDayGroup {
	date: string;
	label: string;
	items: HomeTimelineItem[];
}

function cutoffIsoDate(days: number): string {
	const cutoff = new Date();
	cutoff.setHours(0, 0, 0, 0);
	cutoff.setDate(cutoff.getDate() - (days - 1));
	return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
}

function mealSortTime(meal: NutritionMealEntry): string {
	const t = meal.time.trim();
	if (/^\d{1,2}:\d{2}/.test(t)) {
		const [hh, mm] = t.split(":");
		return `${hh!.padStart(2, "0")}:${mm!.padStart(2, "0")}`;
	}
	return "12:00";
}

function workoutSortTime(entry: WorkoutListEntry): string {
	if (entry.startTimeIso) {
		const d = new Date(entry.startTimeIso);
		if (!Number.isNaN(d.getTime())) {
			return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
		}
	}
	return "23:59";
}

export function formatBodyCompCardLines(row: BodyCompDay): { primary: string; secondary: string } | null {
	if (row.weight == null && row.bfp == null) return null;
	return {
		primary: row.weight != null ? `${row.weight}lb` : "",
		secondary: row.bfp != null ? `${row.bfp}% BF` : "",
	};
}

export function formatBodyCompTimelineMeta(row: BodyCompDay): string {
	const parts: string[] = [];
	if (row.weight != null) parts.push(`${row.weight} lb`);
	if (row.bfp != null) parts.push(`${row.bfp}% body fat`);
	if (row.lbm != null) parts.push(`${row.lbm} lb lean mass`);
	return parts.join(" · ");
}

function sortDayItems(items: HomeTimelineItem[]): HomeTimelineItem[] {
	return [...items].sort((a, b) => {
		if (a.kind === "bodyComp" && b.kind !== "bodyComp") return -1;
		if (b.kind === "bodyComp" && a.kind !== "bodyComp") return 1;
		const tc = a.sortTime.localeCompare(b.sortTime);
		if (tc !== 0) return tc;
		const kindOrder: Record<HomeTimelineKind, number> = { bodyComp: 0, nutrition: 1, workout: 2 };
		const kc = kindOrder[a.kind] - kindOrder[b.kind];
		if (kc !== 0) return kc;
		return a.title.localeCompare(b.title);
	});
}

export function buildHomeTimelineItems(
	workouts: WorkoutListEntry[],
	nutritionByDate: Map<string, NutritionMealEntry[]>,
	bodyCompByDate: Map<string, BodyCompDay>,
	statsNotePathTemplate: string,
	maxDays: number = HOME_TIMELINE_DAYS,
): HomeTimelineItem[] {
	const cutoff = cutoffIsoDate(maxDays);
	const dates = new Set<string>();

	for (const w of workouts) {
		if (w.date >= cutoff) dates.add(w.date);
	}
	for (const [date, meals] of nutritionByDate) {
		if (date >= cutoff && meals.length > 0) dates.add(date);
	}
	for (const [date, row] of bodyCompByDate) {
		if (date >= cutoff && formatBodyCompCardLines(row)) dates.add(date);
	}

	const out: HomeTimelineItem[] = [];
	for (const date of [...dates].sort((a, b) => b.localeCompare(a))) {
		const dayItems: HomeTimelineItem[] = [];

		const body = bodyCompByDate.get(date);
		if (body && formatBodyCompCardLines(body)) {
			const d = new Date(`${date}T12:00:00`);
			dayItems.push({
				kind: "bodyComp",
				date,
				sortTime: "00:00",
				title: "Body composition",
				meta: formatBodyCompTimelineMeta(body),
				bodyComp: body,
				statsNotePath: getStatsNotePath(d, statsNotePathTemplate),
			});
		}

		for (const meal of nutritionByDate.get(date) ?? []) {
			const metaParts: string[] = [];
			if (meal.time) metaParts.push(meal.time);
			if (meal.calories > 0) metaParts.push(`${Math.round(meal.calories)} kcal`);
			if (meal.protein > 0) metaParts.push(`${Math.round(meal.protein)}p`);
			dayItems.push({
				kind: "nutrition",
				date,
				sortTime: mealSortTime(meal),
				title: meal.meal,
				meta: metaParts.join(" · "),
				meal,
			});
		}

		for (const workout of workouts.filter((w) => w.date === date)) {
			dayItems.push({
				kind: "workout",
				date,
				sortTime: workoutSortTime(workout),
				title: workout.displayName,
				meta: undefined,
				workoutPath: workout.path,
				iconName: workout.iconName,
			});
		}

		out.push(...sortDayItems(dayItems));
	}

	return out;
}

export function groupHomeTimelineByDate(
	items: HomeTimelineItem[],
	labelForDate: (iso: string) => string,
): HomeTimelineDayGroup[] {
	const byDate = new Map<string, HomeTimelineItem[]>();
	for (const item of items) {
		const list = byDate.get(item.date) ?? [];
		list.push(item);
		byDate.set(item.date, list);
	}

	return [...byDate.keys()]
		.sort((a, b) => b.localeCompare(a))
		.map((date) => ({
			date,
			label: labelForDate(date),
			items: sortDayItems(byDate.get(date) ?? []),
		}));
}

export async function loadNutritionByDateForRange(
	loadMonthEntries: (year: number, month: number) => Promise<NutritionMealEntry[]>,
	startDate: string,
	endDate: string,
): Promise<Map<string, NutritionMealEntry[]>> {
	const months = new Set<string>();
	const start = new Date(`${startDate}T12:00:00`);
	const end = new Date(`${endDate}T12:00:00`);
	const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
	const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
	while (cursor <= endMonth) {
		months.add(
			`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
		);
		cursor.setMonth(cursor.getMonth() + 1);
	}

	const all: NutritionMealEntry[] = [];
	for (const ym of months) {
		const [y, mo] = ym.split("-").map(Number);
		all.push(...(await loadMonthEntries(y!, mo! - 1)));
	}
	const map = new Map<string, NutritionMealEntry[]>();
	for (const meal of all) {
		if (meal.date < startDate || meal.date > endDate) continue;
		const list = map.get(meal.date) ?? [];
		list.push(meal);
		map.set(meal.date, list);
	}
	for (const [, list] of map) {
		list.sort((a, b) => mealSortTime(a).localeCompare(mealSortTime(b)) || a.meal.localeCompare(b.meal));
	}
	return map;
}

export function bodyCompByDateFromSeries(series: BodyCompDay[]): Map<string, BodyCompDay> {
	return new Map(series.map((row) => [row.date, row]));
}
