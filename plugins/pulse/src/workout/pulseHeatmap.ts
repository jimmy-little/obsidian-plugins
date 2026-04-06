import { buildHeatmapGrid, createHeatmapElement } from "@obsidian-suite/heatmap";

/** Match Orbit default (`0` = Sunday first column / row order per suite layout). */
export const PULSE_HEATMAP_FIRST_DAY_OF_WEEK = 0;

/**
 * Orbit-style yearly grid: month labels on top, weekday letters on the left (`suite-heatmap-wrap`).
 */
export function createSuiteWorkoutHeatmap(
	dateToCount: ReadonlyMap<string, number>,
	options?: { ariaLabel?: string; firstDayOfWeek?: number },
): HTMLElement {
	const grid = buildHeatmapGrid(dateToCount, {
		firstDayOfWeek: options?.firstDayOfWeek ?? PULSE_HEATMAP_FIRST_DAY_OF_WEEK,
		intensity: "relative",
	});
	return createHeatmapElement(grid, {
		ariaLabel: options?.ariaLabel ?? "Activity in the last year",
	});
}
