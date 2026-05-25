import type { Plugin } from "obsidian";
import type RatchetPlugin from "../main";
import { startOfDayLocal } from "../utils/DateUtils";
import { renderTrackerCard } from "../ui/TrackerCard";
import { RESET_PERIOD_LABELS, isCheckOffHabit, DEFAULT_TRACKER_COLOR } from "../data/TrackerConfig";
import { toggleCheckOffDay } from "../ui/checkOffDay";
import { emptyDayDetail } from "../ui/gridMonthModel";
import { createHabitHeatmapElement } from "../ui/habitHeatmapBuilder";

export interface BlockParams {
	tracker?: string;
	"show-goal"?: boolean;
	days?: number;
	period?: string;
}

/** Parse key: value lines from code block source. */
export function parseBlockParams(source: string): BlockParams {
	const params: BlockParams = {};
	for (const line of source.split("\n")) {
		const m = line.match(/^\s*([a-z-]+)\s*:\s*(.+)$/i);
		if (!m) continue;
		const key = m[1].trim().toLowerCase();
		const raw = m[2].trim();
		if (key === "tracker") params.tracker = raw;
		else if (key === "show-goal") params["show-goal"] = /^(true|1|yes)$/i.test(raw);
		else if (key === "days") {
			const n = parseInt(raw, 10);
			if (!isNaN(n) && n > 0) params.days = n;
		} else if (key === "period") params.period = raw;
	}
	return params;
}

/** Resolve days from params: explicit days, or period shorthand (45, 90, 365). */
export function resolveHeatmapDays(params: BlockParams): number {
	if (params.days != null) return Math.min(366, Math.max(7, params.days));
	const p = (params.period || "").toLowerCase();
	if (p === "45" || p === "1.5 months") return 45;
	if (p === "90" || p === "3 months" || p === "quarter") return 90;
	if (p === "365" || p === "year" || p === "1y") return 365;
	return 90; // default
}

/** Comma-separated tracker ids from a block param value. */
export function parseTrackerIds(raw: string): string[] {
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export function registerRatchetCounter(
	plugin: Plugin,
	callback: (source: string, el: HTMLElement) => void,
): void {
	(plugin as RatchetPlugin).registerMarkdownCodeBlockProcessor("ratchet-counter", callback);
}

/** Render a single counter card into container. */
async function renderOneCounter(
	container: HTMLElement,
	trackerId: string,
	params: BlockParams,
	plugin: RatchetPlugin,
): Promise<boolean> {
	const dm = plugin.getDataManager();
	const tracker = await dm.getTracker(trackerId);
	if (!tracker) {
		container.createSpan({ text: `Tracker not found: ${trackerId}`, cls: "ratchet-counter-error" });
		return false;
	}
	const showGoal = params["show-goal"] ?? true;

	const wrap = container.createDiv("ratchet-counter-wrap");
	wrap.style.setProperty("--ratchet-card-accent", tracker.color || "var(--background-modifier-border)");
	const top = wrap.createDiv("ratchet-counter-top");
	top.createSpan({ cls: "ratchet-counter-icon", text: tracker.icon });
	top.createSpan({ cls: "ratchet-counter-name", text: tracker.name });

	const countEl = wrap.createDiv("ratchet-counter-value");
	const countNum = countEl.createSpan("ratchet-counter-num");
	if (tracker.unit) countEl.createSpan({ cls: "ratchet-counter-unit", text: ` ${tracker.unit}` });
	const updateCount = async (): Promise<void> => {
		const count = await dm.getCurrentCount(trackerId);
		countNum.textContent = String(count);
	};
	await updateCount();

	const btnRow = wrap.createDiv("ratchet-counter-buttons");
	btnRow.createEl("button", { text: "−1" }).addEventListener("click", async () => {
		await dm.increment(trackerId, -1);
		await updateCount();
	});
	btnRow.createEl("button", { text: "+1" }).addEventListener("click", async () => {
		await dm.increment(trackerId, 1);
		await updateCount();
	});

	if (showGoal && tracker.goalType !== "none") {
		const goalLine = wrap.createDiv("ratchet-counter-goal");
		const count = await dm.getCurrentCount(trackerId);
		const met = tracker.goalType === "at least" ? count >= tracker.goal : count <= tracker.goal;
		const periodLabel = RESET_PERIOD_LABELS[tracker.resetPeriod];
		goalLine.createSpan({
			text: `${periodLabel}: ${count}/${tracker.goal} ${met ? "✓" : ""}`,
			cls: met ? "ratchet-counter-goal-met" : "",
		});
	}
	return true;
}

export async function renderRatchetCounter(
	source: string,
	el: HTMLElement,
	plugin: RatchetPlugin,
): Promise<void> {
	const params = parseBlockParams(source);
	const raw = params.tracker?.trim() ?? "";
	if (!raw) {
		el.createSpan({ text: "ratchet-counter: specify tracker: <id> or tracker: id1, id2, id3" });
		return;
	}
	const trackerIds = parseTrackerIds(raw);
	if (trackerIds.length === 0) {
		el.createSpan({ text: "ratchet-counter: specify at least one tracker id" });
		return;
	}
	const container = trackerIds.length > 1 ? el.createDiv("ratchet-counters") : el;
	for (const id of trackerIds) {
		if (trackerIds.length > 1) {
			await renderOneCounter(container, id, params, plugin);
		} else {
			await renderOneCounter(el, id, params, plugin);
			break;
		}
	}
}

export function registerRatchetHeatmap(
	plugin: Plugin,
	callback: (source: string, el: HTMLElement) => void,
): void {
	(plugin as RatchetPlugin).registerMarkdownCodeBlockProcessor("ratchet-heatmap", callback);
}

/** Parse YYYY-MM-DD into local date at noon */
function parseDateKey(key: string): Date | null {
	const [y, m, d] = key.split("-").map(Number);
	if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
	return new Date(y, m - 1, d, 12, 0, 0, 0);
}

async function logHabitDay(plugin: RatchetPlugin, trackerId: string, dateKey: string): Promise<void> {
	const dm = plugin.getDataManager();
	const tr = await dm.getTracker(trackerId);
	if (!tr) return;
	const targetDate = parseDateKey(dateKey);
	if (!targetDate) return;
	if (isCheckOffHabit(tr)) {
		const start = startOfDayLocal(targetDate);
		const end = new Date(start);
		end.setDate(end.getDate() + 1);
		const entries = await dm.getDayEntries(trackerId, start, new Date(end.getTime() - 1));
		const row = entries[0];
		await toggleCheckOffDay(
			dm,
			trackerId,
			targetDate,
			row ? { count: row.count, eventCount: row.eventCount, hasDoneMarker: row.hasDoneMarker } : emptyDayDetail(),
		);
	} else {
		await dm.incrementOnDate(trackerId, 1, targetDate);
	}
}

interface HeatmapBuildOptions {
	hideTitle?: boolean;
	rerender?: () => Promise<void>;
}

/** Build heatmap DOM into container. Used by ratchet-heatmap and ratchet-summary. */
async function buildHeatmapInto(
	container: HTMLElement,
	trackerId: string,
	days: number,
	plugin: RatchetPlugin,
	opts?: HeatmapBuildOptions,
): Promise<void> {
	const dm = plugin.getDataManager();
	const tracker = await dm.getTracker(trackerId);
	if (!tracker) return;

	const accent = tracker.color || DEFAULT_TRACKER_COLOR;
	container.style.setProperty("--ratchet-heatmap-accent", accent);

	const daysBack = Math.max(6, days - 1);
	const heatmap = await createHabitHeatmapElement(plugin, tracker, daysBack, {
		ariaLabel: `${tracker.name} activity`,
		onDayClick: opts?.rerender
			? async (dateKey) => {
					await logHabitDay(plugin, trackerId, dateKey);
					await opts.rerender!();
				}
			: async (dateKey) => {
					await logHabitDay(plugin, trackerId, dateKey);
				},
	});

	container.empty();
	if (!opts?.hideTitle) {
		container.createEl("div", { cls: "ratchet-heatmap-title", text: tracker.name });
	}
	container.appendChild(heatmap);
}

export async function renderRatchetHeatmap(
	source: string,
	el: HTMLElement,
	plugin: RatchetPlugin,
): Promise<void> {
	const params = parseBlockParams(source);
	const raw = params.tracker?.trim() ?? "";
	if (!raw) {
		el.createSpan({ text: "ratchet-heatmap: specify tracker: <id> or tracker: id1, id2, id3" });
		return;
	}
	const trackerIds = parseTrackerIds(raw);
	if (trackerIds.length === 0) {
		el.createSpan({ text: "ratchet-heatmap: specify at least one tracker id" });
		return;
	}
	const days = resolveHeatmapDays(params);
	const rerender = async (): Promise<void> => {
		el.empty();
		await renderRatchetHeatmap(source, el, plugin);
	};
	const container = trackerIds.length > 1 ? el.createDiv("ratchet-heatmap-blocks") : el;
	for (const trackerId of trackerIds) {
		const parent = trackerIds.length > 1 ? container : el;
		const tracker = await plugin.getDataManager().getTracker(trackerId);
		if (!tracker) {
			parent.createSpan({ text: `Tracker not found: ${trackerId}`, cls: "ratchet-counter-error" });
			continue;
		}
		const blockWrap = parent.createDiv("ratchet-heatmap-block");
		blockWrap.style.setProperty("--ratchet-heatmap-accent", tracker.color || DEFAULT_TRACKER_COLOR);
		const heatmapContainer = blockWrap.createDiv("ratchet-heatmap");
		await buildHeatmapInto(heatmapContainer, trackerId, days, plugin, { rerender });
		if (trackerIds.length === 1) break;
	}
}

export function registerRatchetSummary(
	plugin: Plugin,
	callback: (source: string, el: HTMLElement) => void,
): void {
	(plugin as RatchetPlugin).registerMarkdownCodeBlockProcessor("ratchet-summary", callback);
}

async function renderOneSummary(
	container: HTMLElement,
	trackerId: string,
	days: number,
	plugin: RatchetPlugin,
	rerender: () => Promise<void>,
): Promise<boolean> {
	const dm = plugin.getDataManager();
	const tracker = await dm.getTracker(trackerId);
	if (!tracker) {
		container.createSpan({ text: `Tracker not found: ${trackerId}`, cls: "ratchet-counter-error" });
		return false;
	}
	const wrap = container.createDiv("ratchet-summary");
	wrap.style.setProperty("--ratchet-card-accent", tracker.color || "var(--background-modifier-border)");
	const left = wrap.createDiv("ratchet-summary-card");
	const right = wrap.createDiv("ratchet-summary-heatmap");
	renderTrackerCard(left, {
		tracker,
		dataManager: dm,
		onIncrement: async () => {
			await rerender();
		},
	});
	const heatmapRoot = right.createDiv("ratchet-heatmap");
	heatmapRoot.style.setProperty("--ratchet-heatmap-accent", tracker.color || DEFAULT_TRACKER_COLOR);
	await buildHeatmapInto(heatmapRoot, trackerId, days, plugin, {
		hideTitle: true,
		rerender,
	});
	return true;
}

export async function renderRatchetSummary(
	source: string,
	el: HTMLElement,
	plugin: RatchetPlugin,
): Promise<void> {
	const params = parseBlockParams(source);
	const raw = params.tracker?.trim() ?? "";
	if (!raw) {
		el.createSpan({ text: "ratchet-summary: specify tracker: <id> or tracker: id1, id2, id3" });
		return;
	}
	const trackerIds = parseTrackerIds(raw);
	if (trackerIds.length === 0) {
		el.createSpan({ text: "ratchet-summary: specify at least one tracker id" });
		return;
	}
	const days = resolveHeatmapDays(params);
	const rerender = async (): Promise<void> => {
		el.empty();
		await renderRatchetSummary(source, el, plugin);
	};
	const container = trackerIds.length > 1 ? el.createDiv("ratchet-summaries") : el;
	for (const id of trackerIds) {
		await renderOneSummary(trackerIds.length > 1 ? container : el, id, days, plugin, rerender);
		if (trackerIds.length === 1) break;
	}
}
