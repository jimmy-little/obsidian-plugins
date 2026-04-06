import type PulsePlugin from "../main";
import { formatPulseImportAt } from "../formatImport";
import { loadBodyCompSeries } from "../stats/loadBodyCompSeries";
import type { BodyCompDay, BodyMetricDef, BodyTimeRange } from "../stats/bodyCompTypes";
import { BODY_METRIC_DEFS } from "../stats/bodyCompTypes";
import { renderSmoothLineChart } from "./charts";

const RANGE_OPTIONS: { id: BodyTimeRange; label: string }[] = [
	{ id: "week", label: "Week" },
	{ id: "month", label: "Month" },
	{ id: "3month", label: "3 Month" },
	{ id: "year", label: "Year" },
	{ id: "all", label: "All Time" },
];

function toIsoDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function filterRowsByRange(rows: BodyCompDay[], range: BodyTimeRange): BodyCompDay[] {
	if (range === "all") return rows;
	const start = new Date();
	switch (range) {
		case "week":
			start.setDate(start.getDate() - 7);
			break;
		case "month":
			start.setDate(start.getDate() - 30);
			break;
		case "3month":
			start.setDate(start.getDate() - 90);
			break;
		case "year":
			start.setDate(start.getDate() - 365);
			break;
		default:
			return rows;
	}
	const startStr = toIsoDate(start);
	return rows.filter((r) => r.date >= startStr);
}

function formatVal(def: BodyMetricDef, n: number | undefined): string {
	if (n === undefined || Number.isNaN(n)) return "—";
	const f = n.toFixed(def.decimals);
	return def.unit ? `${f} ${def.unit}`.trim() : f;
}

function formatDelta(def: BodyMetricDef, delta: number | undefined, hasRange: boolean): string {
	if (!hasRange || delta === undefined || Number.isNaN(delta)) return "—";
	const sign = delta > 0 ? "+" : "";
	const f = delta.toFixed(def.decimals);
	const u = def.unit ? ` ${def.unit}` : "";
	return `${sign}${f}${u}`;
}

export class BodyCompTab {
	private plugin: PulsePlugin;
	private container: HTMLElement | null = null;
	private charts: { destroy(): void }[] = [];
	private allRows: BodyCompDay[] = [];
	private range: BodyTimeRange = "month";
	private cardsRoot: HTMLElement | null = null;

	constructor(plugin: PulsePlugin) {
		this.plugin = plugin;
	}

	async render(container: HTMLElement): Promise<void> {
		this.container = container;
		this.destroyCharts();
		container.empty();
		container.createDiv({ cls: "pulse-workout-loading", text: "Loading body metrics..." });

		const template = this.plugin.settings.statsNotePathTemplate?.trim() || "60 Logs/{year}/Stats/{month}/{date}.md";
		this.allRows = await loadBodyCompSeries(this.plugin.app.vault, template);

		container.empty();
		const wrap = container.createDiv({ cls: "pulse-body" });

		const head = wrap.createDiv({ cls: "pulse-body__head" });
		head.createEl("h2", { text: "Body", cls: "pulse-pm__main-title pulse-body__title" });

		const seg = head.createDiv({ cls: "pulse-body__segmented", attr: { role: "tablist" } });
		for (const opt of RANGE_OPTIONS) {
			const btn = seg.createEl("button", {
				cls: `pulse-body__segment ${this.range === opt.id ? "pulse-body__segment--active" : ""}`,
				text: opt.label,
				attr: { type: "button", role: "tab", "aria-selected": this.range === opt.id ? "true" : "false" },
			});
			btn.addEventListener("click", () => {
				if (this.range === opt.id) return;
				this.range = opt.id;
				for (const b of seg.querySelectorAll(".pulse-body__segment")) {
					const el = b as HTMLElement;
					const active = el === btn;
					el.classList.toggle("pulse-body__segment--active", active);
					el.setAttribute("aria-selected", active ? "true" : "false");
				}
				void this.refreshCards();
			});
		}

		this.cardsRoot = wrap.createDiv({ cls: "pulse-body__cards" });
		await this.refreshCards();

		const foot = wrap.createDiv({ cls: "pulse-body__footer" });
		foot.createSpan({ cls: "pulse-body__footer-label", text: "Last import: " });
		foot.createSpan({
			cls: "pulse-body__footer-date",
			text: formatPulseImportAt(this.plugin.settings.lastBodyCompImportAt),
		});
	}

	private async refreshCards(): Promise<void> {
		if (!this.cardsRoot) return;
		this.destroyCharts();
		this.cardsRoot.empty();

		const filtered = filterRowsByRange(this.allRows, this.range);
		const defsToShow = BODY_METRIC_DEFS.filter((def) =>
			this.allRows.some((r) => r[def.key] != null)
		);

		if (this.allRows.length === 0) {
			this.cardsRoot.createEl("p", {
				cls: "pulse-workout-muted",
				text: "No body composition data yet. Import FITINDEX or RENPHO CSV, or Health Auto Export JSON into your scan folder, then run Scan for Health and Workout Imports.",
			});
			return;
		}

		if (defsToShow.length === 0) {
			this.cardsRoot.createEl("p", {
				cls: "pulse-workout-muted",
				text: "Stats notes exist but no body metric fields were found. Check that imports use the default stats note path template.",
			});
			return;
		}

		for (const def of defsToShow) {
			await this.renderMetricCard(this.cardsRoot, def, filtered);
		}
	}

	private async renderMetricCard(parent: HTMLElement, def: BodyMetricDef, filtered: BodyCompDay[]): Promise<void> {
		const points = filtered
			.map((r) => ({ date: r.date, v: r[def.key] }))
			.filter((p): p is { date: string; v: number } => p.v != null && !Number.isNaN(p.v));

		const card = parent.createDiv({ cls: "pulse-body-card" });
		const left = card.createDiv({ cls: "pulse-body-card__meta" });
		left.createDiv({ cls: "pulse-body-card__label", text: def.label });

		const stats = left.createDiv({ cls: "pulse-body-card__stats" });

		let high: number | undefined;
		let low: number | undefined;
		let current: number | undefined;
		let delta: number | undefined;

		if (points.length > 0) {
			const vals = points.map((p) => p.v);
			high = Math.max(...vals);
			low = Math.min(...vals);
			current = points[points.length - 1]!.v;
			if (points.length >= 2) {
				delta = current - points[0]!.v;
			}
		}

		const addStat = (k: string, val: string) => {
			const cell = stats.createDiv({ cls: "pulse-body-card__stat" });
			cell.createSpan({ cls: "pulse-body-card__stat-key", text: k });
			cell.createSpan({ cls: "pulse-body-card__stat-val", text: val });
		};

		addStat("High", formatVal(def, high));
		addStat("Low", formatVal(def, low));
		addStat("Current", formatVal(def, current));
		addStat("Change", formatDelta(def, delta, points.length >= 2));

		const chartWrap = card.createDiv({ cls: "pulse-body-card__chart" });

		if (points.length === 0) {
			chartWrap.createDiv({
				cls: "pulse-body-card__chart-empty pulse-workout-muted",
				text: "No measurements in this range",
			});
			return;
		}

		const canvas = chartWrap.createEl("canvas");
		canvas.height = 140;

		const chartPoints = points.map((p) => ({ x: p.date.slice(5), y: p.v }));
		try {
			const chart = await renderSmoothLineChart(canvas, chartPoints, def.label);
			this.charts.push(chart);
		} catch (e) {
			console.warn("Body metric chart error:", e);
			chartWrap.createEl("p", { text: "Chart unavailable", cls: "pulse-workout-muted" });
		}
	}

	private destroyCharts(): void {
		for (const c of this.charts) c.destroy();
		this.charts = [];
	}

	destroy(): void {
		this.destroyCharts();
		this.container = null;
		this.cardsRoot = null;
	}
}
