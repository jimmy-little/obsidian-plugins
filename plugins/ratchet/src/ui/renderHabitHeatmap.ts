import type RatchetPlugin from "../main";
import type { TrackerConfig } from "../data/TrackerConfig";
import { createHabitHeatmapElement, HABIT_HEATMAP_YEAR_DAYS } from "./habitHeatmapBuilder";

export async function renderHabitHeatmap(
	mount: HTMLElement,
	plugin: RatchetPlugin,
	tracker: TrackerConfig,
	_onRefresh: () => void,
): Promise<void> {
	mount.empty();
	mount.addClass("ratchet-habit-section");
	mount.createEl("h2", { cls: "ratchet-habit-section__title", text: "Activity" });

	const heatmap = await createHabitHeatmapElement(plugin, tracker, HABIT_HEATMAP_YEAR_DAYS, {
		ariaLabel: `${tracker.name} activity in the last year`,
	});
	mount.appendChild(heatmap);

	const legend = mount.createDiv({ cls: "ratchet-habit-heatmap-legend" });
	legend.createSpan({ cls: "ratchet-habit-heatmap-legend__label", text: "Less" });
	for (const level of [0, 2, 4] as const) {
		const sw = legend.createDiv("ratchet-habit-heatmap-legend__swatch");
		sw.dataset.level = String(level);
	}
	legend.createSpan({ cls: "ratchet-habit-heatmap-legend__label", text: "Complete" });
}
