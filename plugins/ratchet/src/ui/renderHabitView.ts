import type RatchetPlugin from "../main";
import type { TrackerConfig } from "../data/TrackerConfig";
import { RESET_PERIOD_LABELS, hasGoal, isCheckOffHabit, formatCheckOffGoalSummary, isTrackerArchived } from "../data/TrackerConfig";
import { preferLightForegroundOnAccentCss } from "../utils/trackerAccent";
import { renderHabitHeatmap } from "./renderHabitHeatmap";
import { renderHabitCalendar } from "./renderHabitCalendar";
import { renderHabitMetadata } from "./renderHabitMetadata";

export interface RenderHabitViewOptions {
	onRefresh: () => void;
	onDeleted?: () => void;
}

/** Main-pane habit detail: Fulcrum-style header, heatmap, calendar, metadata. */
export async function renderHabitView(
	mount: HTMLElement,
	plugin: RatchetPlugin,
	trackerId: string,
	options: RenderHabitViewOptions,
): Promise<boolean> {
	mount.empty();
	const dm = plugin.getDataManager();
	const tracker = await dm.getTracker(trackerId);
	if (!tracker) {
		mount.createDiv({
			cls: "ratchet-habit-empty",
			text: "Tracker not found.",
		});
		return false;
	}

	const accent = tracker.color || "var(--interactive-accent)";
	const lightFg = preferLightForegroundOnAccentCss(accent);
	const ctaFg = lightFg ? "rgba(255, 255, 255, 0.97)" : "rgba(24, 24, 28, 0.95)";

	const root = mount.createDiv({ cls: "ratchet-habit" });
	root.style.setProperty("--ratchet-accent", accent);
	root.style.setProperty("--ratchet-cta-fg", ctaFg);

	renderHabitBanner(root, tracker, lightFg);

	const heatmapMount = root.createDiv({ cls: "ratchet-habit__heatmap" });
	await renderHabitHeatmap(heatmapMount, plugin, tracker, options.onRefresh);

	const calMount = root.createDiv({ cls: "ratchet-habit__calendar" });
	await renderHabitCalendar(calMount, plugin, tracker, options.onRefresh);

	const metaMount = root.createDiv({ cls: "ratchet-habit__metadata" });
	renderHabitMetadata(metaMount, plugin, tracker, {
		onRefresh: options.onRefresh,
		onDeleted: options.onDeleted,
	});

	return true;
}

function renderHabitBanner(root: HTMLElement, tracker: TrackerConfig, lightFg: boolean): void {

	const banner = root.createDiv({ cls: "ratchet-habit-banner ratchet-habit-banner--solid" });
	banner.style.backgroundColor = tracker.color || "var(--interactive-accent)";

	const inner = banner.createDiv({
		cls: `ratchet-habit-banner__inner ratchet-habit-banner__inner--has-foot ${lightFg ? "ratchet-habit-banner__inner--on-dark" : "ratchet-habit-banner__inner--on-light"}`,
	});

	const top = inner.createDiv({ cls: "ratchet-habit-banner__top" });
	const left = top.createDiv({ cls: "ratchet-habit-banner__left" });
	left.createSpan({ cls: "ratchet-habit-banner__icon", text: tracker.icon || "📌" });
	left.createEl("h1", { cls: "ratchet-habit-banner__title", text: tracker.name });

	const goalLine = goalBannerText(tracker);
	if (goalLine) {
		left.createEl("p", { cls: "ratchet-habit-banner__desc", text: goalLine });
	}

	const foot = inner.createDiv({ cls: "ratchet-habit-banner__foot" });
	const footLeft = foot.createDiv({ cls: "ratchet-habit-banner__foot-left" });
	footLeft.createSpan({
		cls: "ratchet-habit-banner__pill",
		text: RESET_PERIOD_LABELS[tracker.resetPeriod] ?? tracker.resetPeriod,
	});
	if (isTrackerArchived(tracker)) {
		footLeft.createSpan({
			cls: "ratchet-habit-banner__pill ratchet-habit-banner__pill--muted",
			text: "Archived",
		});
	}
	if (tracker.unit?.trim()) {
		footLeft.createSpan({
			cls: "ratchet-habit-banner__pill ratchet-habit-banner__pill--muted",
			text: tracker.unit.trim(),
		});
	}
}

function goalBannerText(tracker: TrackerConfig): string {
	if (isCheckOffHabit(tracker)) {
		return `Goal: ${formatCheckOffGoalSummary(tracker)} — mark each day when done`;
	}
	if (!hasGoal(tracker)) return "No goal — just count";
	const unit = tracker.unit?.trim() ? ` ${tracker.unit.trim()}` : "";
	if (tracker.goalType === "at least") return `Goal: at least ${tracker.goal}${unit} per ${RESET_PERIOD_LABELS[tracker.resetPeriod]?.toLowerCase() ?? tracker.resetPeriod}`;
	return `Goal: at most ${tracker.goal}${unit} per ${RESET_PERIOD_LABELS[tracker.resetPeriod]?.toLowerCase() ?? tracker.resetPeriod}`;
}
