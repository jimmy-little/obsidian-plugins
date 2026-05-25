import { buildHeatmapGrid, createHeatmapElement } from "@obsidian-suite/heatmap";
import type RatchetPlugin from "../main";
import type { TrackerConfig } from "../data/TrackerConfig";
import { habitDayHeatLevel } from "./habitDayStatus";

export const HABIT_HEATMAP_YEAR_DAYS = 364;
export const HABIT_HEATMAP_MINI_DAYS = 83;

export async function createHabitHeatmapElement(
	plugin: RatchetPlugin,
	tracker: TrackerConfig,
	daysBack: number,
	options?: {
		ariaLabel?: string;
		onDayClick?: (dateKey: string) => void | Promise<void>;
	},
): Promise<HTMLElement> {
	const dm = plugin.getDataManager();
	const today = new Date();
	const start = new Date(today);
	start.setDate(start.getDate() - daysBack);
	start.setHours(0, 0, 0, 0);

	const entries = await dm.getDayEntries(tracker.id, start, today);
	const counts = new Map<string, number>();
	const eventCounts = new Map<string, number>();
	const doneMarkers = new Map<string, boolean>();
	for (const e of entries) {
		counts.set(e.dateKey, e.count);
		eventCounts.set(e.dateKey, e.eventCount);
		doneMarkers.set(e.dateKey, e.hasDoneMarker);
	}

	const grid = buildHeatmapGrid(counts, {
		firstDayOfWeek: plugin.settings.firstDayOfWeek,
		daysBack,
		intensity: "fixed",
		fixedThresholds: [1, 1, 1, 1],
	});

	for (const col of grid.columns) {
		for (const cell of col) {
			if (!cell.inRange) continue;
			const count = counts.get(cell.dateKey) ?? 0;
			const ev = eventCounts.get(cell.dateKey) ?? 0;
			const hasDone = doneMarkers.get(cell.dateKey) ?? false;
			cell.level = habitDayHeatLevel(tracker, count, ev, hasDone);
		}
	}

	const accent = tracker.color || "var(--interactive-accent)";
	const onDayClick = options?.onDayClick;
	return createHeatmapElement(grid, {
		accentColor: accent,
		ariaLabel: options?.ariaLabel ?? `${tracker.name} activity`,
		onDayClick: onDayClick ? ({ dateKey }) => void onDayClick(dateKey) : undefined,
	});
}
