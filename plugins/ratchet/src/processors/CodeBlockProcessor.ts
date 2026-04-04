import type { Plugin } from "obsidian";
import type RatchetPlugin from "../main";
import { startOfDayLocal, startOfWeekLocal } from "../utils/DateUtils";
import { renderTrackerCard } from "../ui/TrackerCard";
import { RESET_PERIOD_LABELS } from "../data/TrackerConfig";

export interface BlockParams {
	tracker?: string;
	buttons?: number[];
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
		else if (key === "buttons") {
			try {
				const arr = JSON.parse(raw) as number[];
				if (Array.isArray(arr)) params.buttons = arr;
			} catch {
				/* ignore */
			}
		} else if (key === "show-goal") params["show-goal"] = /^(true|1|yes)$/i.test(raw);
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
	const buttons = params.buttons?.length ? params.buttons : tracker.incrementButtons;
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
	btnRow.createEl("button", { text: "-1" }).addEventListener("click", async () => {
		await dm.increment(trackerId, -1);
		await updateCount();
	});
	for (const v of buttons) {
		const btn = btnRow.createEl("button", { text: `+${v}` });
		btn.addEventListener("click", async () => {
			await dm.increment(trackerId, v);
			await updateCount();
		});
	}

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
	const trackerIds = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function addDays(d: Date, n: number): Date {
	const out = new Date(d);
	out.setDate(out.getDate() + n);
	return out;
}

function dateKey(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Format date for hover tooltip e.g. "Mon, Feb 15, 2026" */
function formatCellTitle(d: Date): string {
	const day = DAY_NAMES[d.getDay()];
	const month = MONTH_NAMES[d.getMonth()];
	const date = d.getDate();
	const year = d.getFullYear();
	return `${day}, ${month} ${date}, ${year}`;
}

/** Parse YYYY-MM-DD into local date at noon */
function parseDateKey(key: string): Date | null {
	const [y, m, d] = key.split("-").map(Number);
	if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
	return new Date(y, m - 1, d, 12, 0, 0, 0);
}

interface HeatmapBuildOptions {
	source?: string;
	blockEl?: HTMLElement;
	hideTitle?: boolean;
	rerender?: () => Promise<void>;
}

type HeatmapMeta = { plugin: RatchetPlugin; trackerId: string; rerender?: () => Promise<void> };

/** Build heatmap DOM into container. Used by ratchet-heatmap and ratchet-summary. */
async function buildHeatmapInto(
	container: HTMLElement,
	trackerId: string,
	days: number,
	plugin: RatchetPlugin,
	opts?: HeatmapBuildOptions,
): Promise<void> {
	const dm = plugin.getDataManager();
	const firstDayOfWeek = plugin.settings.firstDayOfWeek;
	const tracker = await dm.getTracker(trackerId);
	if (!tracker) return;

	const doRerender =
		opts?.rerender ??
		(opts?.source && opts?.blockEl
			? () => {
					opts.blockEl!.empty();
					return renderRatchetHeatmap(opts.source!, opts.blockEl!, plugin);
				}
			: undefined);

	(container as HTMLElement & { __ratchetHeatmap?: HeatmapMeta }).__ratchetHeatmap = {
		plugin,
		trackerId,
		rerender: doRerender,
	};
	const today = startOfDayLocal(new Date());
	const startDay = addDays(today, -(days - 1));
	const weekStart = startOfWeekLocal(startDay, firstDayOfWeek);
	const weekStarts: Date[] = [];
	for (
		let d = new Date(weekStart);
		d.getTime() <= today.getTime() + 7 * 24 * 60 * 60 * 1000;
		d = addDays(d, 7)
	) {
		weekStarts.push(new Date(d));
	}
	const numCols = weekStarts.length;
	container.style.setProperty("--heatmap-cols", String(numCols));
	if (!opts?.hideTitle) container.createEl("div", { cls: "ratchet-heatmap-title", text: tracker.name });
	const body = container.createDiv("ratchet-heatmap-body");
	const monthRow = body.createDiv("ratchet-heatmap-months");
	let lastMonth = -1;
	for (let c = 0; c < weekStarts.length; c++) {
		const weekDate = weekStarts[c];
		const m = weekDate.getMonth();
		const span = monthRow.createSpan("ratchet-heatmap-month");
		if (m !== lastMonth) {
			span.textContent = MONTH_NAMES[m];
			lastMonth = m;
		}
	}
	const dayLabels = body.createDiv("ratchet-heatmap-day-labels");
	for (let row = 0; row < 7; row++) {
		const dow = (firstDayOfWeek + row) % 7;
		dayLabels.createDiv("ratchet-heatmap-day-label").setText(DAY_NAMES[dow]);
	}
	const grid = body.createDiv("ratchet-heatmap-grid");
	const goalByDate = new Map<string, "met" | "not_met" | "no_data">();
	for (let d = new Date(startDay); d.getTime() <= today.getTime(); d = addDays(d, 1)) {
		goalByDate.set(dateKey(d), await dm.getGoalStatusForDay(trackerId, d));
	}
	const trackerColor = tracker.color || "#7c3aed";
	const notMetColor = "#dc2626";
	const noDataColor = "#ebedf0";
	for (let row = 0; row < 7; row++) {
		const rowEl = grid.createDiv("ratchet-heatmap-row");
		for (let col = 0; col < weekStarts.length; col++) {
			const cellDate = addDays(weekStarts[col], row);
			const before = cellDate.getTime() < startDay.getTime();
			const after = cellDate.getTime() > today.getTime();
			const inRange = !before && !after;
			const status = goalByDate.get(dateKey(cellDate));
			const isToday = isSameDay(cellDate, today);
			const cell = rowEl.createDiv("ratchet-heatmap-cell");
			if (!inRange) {
				cell.addClass("ratchet-heatmap-cell-empty");
				cell.style.backgroundColor = noDataColor;
			} else if (status === "met") {
				cell.addClass("ratchet-heatmap-cell-met");
				cell.style.backgroundColor = trackerColor;
			} else if (status === "not_met") {
				cell.addClass("ratchet-heatmap-cell-not-met");
				cell.style.backgroundColor = notMetColor;
			} else {
				cell.addClass("ratchet-heatmap-cell-no-data");
				cell.style.backgroundColor = noDataColor;
			}
			if (isToday) cell.addClass("ratchet-heatmap-cell-today");
			cell.setAttribute("data-date", dateKey(cellDate));
			cell.setAttribute("title", formatCellTitle(cellDate));
			if (inRange) {
				cell.addClass("ratchet-heatmap-cell-clickable");
				cell.addEventListener("click", async () => {
					const heatmapEl = cell.closest(".ratchet-heatmap");
					const meta = (heatmapEl as HTMLElement & { __ratchetHeatmap?: HeatmapMeta } | null)?.__ratchetHeatmap;
					if (!meta) return;
					const { plugin: plug, trackerId: tid, rerender } = meta;
					const dateKeyVal = cell.getAttribute("data-date");
					if (!dateKeyVal) return;
					const targetDate = parseDateKey(dateKeyVal);
					if (!targetDate) return;
					const dmm = plug.getDataManager();
					const tr = await dmm.getTracker(tid);
					if (!tr) return;
					const value = tr.goalType === "at most" && tr.goal === 0 ? 0 : 1;
					await dmm.incrementOnDate(tid, value, targetDate, value === 0 ? "done" : "");
					if (rerender) await rerender();
				});
			}
		}
	}
}

export async function renderRatchetHeatmap(
	source: string,
	el: HTMLElement,
	plugin: RatchetPlugin,
): Promise<void> {
	const params = parseBlockParams(source);
	const trackerId = params.tracker?.trim();
	if (!trackerId) {
		el.createSpan({ text: "ratchet-heatmap: specify tracker: <id>" });
		return;
	}
	const days = resolveHeatmapDays(params);
	const tracker = await plugin.getDataManager().getTracker(trackerId);
	if (!tracker) {
		el.createSpan({ text: `Tracker not found: ${trackerId}` });
		return;
	}
	const blockWrap = el.createDiv("ratchet-heatmap-block");
	const container = blockWrap.createDiv("ratchet-heatmap");
	await buildHeatmapInto(container, trackerId, days, plugin, {
		source,
		blockEl: el,
		rerender: async () => {
			el.empty();
			await renderRatchetHeatmap(source, el, plugin);
		},
	});
}

export function registerRatchetSummary(
	plugin: Plugin,
	callback: (source: string, el: HTMLElement) => void,
): void {
	(plugin as RatchetPlugin).registerMarkdownCodeBlockProcessor("ratchet-summary", callback);
}

export async function renderRatchetSummary(
	source: string,
	el: HTMLElement,
	plugin: RatchetPlugin,
): Promise<void> {
	const params = parseBlockParams(source);
	const trackerId = params.tracker?.trim();
	if (!trackerId) {
		el.createSpan({ text: "ratchet-summary: specify tracker: <id>" });
		return;
	}
	const days = resolveHeatmapDays(params);
	const dm = plugin.getDataManager();
	const tracker = await dm.getTracker(trackerId);
	if (!tracker) {
		el.createSpan({ text: `Tracker not found: ${trackerId}` });
		return;
	}
	const wrap = el.createDiv("ratchet-summary");
	wrap.style.setProperty("--ratchet-card-accent", tracker.color || "var(--background-modifier-border)");
	const left = wrap.createDiv("ratchet-summary-card");
	const right = wrap.createDiv("ratchet-summary-heatmap");
	renderTrackerCard(left, {
		tracker,
		dataManager: dm,
		onIncrement: async () => {
			el.empty();
			await renderRatchetSummary(source, el, plugin);
		},
	});
	const heatmapRoot = right.createDiv("ratchet-heatmap");
	await buildHeatmapInto(heatmapRoot, trackerId, days, plugin, {
		hideTitle: true,
		rerender: async () => {
			el.empty();
			await renderRatchetSummary(source, el, plugin);
		},
	});
}
