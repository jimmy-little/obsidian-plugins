import type { ExerciseLogEntry } from "./types";

/**
 * Chart.js draws on canvas; this mixes theme colors so grid lines stay visible in dark mode
 * (plain --background-modifier-border is often too low-contrast on dark backgrounds).
 */
const CHART_GRID_COLOR =
	"color-mix(in srgb, var(--text-muted) 40%, var(--background-primary))";

type ChartType = { new(ctx: CanvasRenderingContext2D, config: Record<string, unknown>): { destroy(): void } };
type ChartModule = { Chart: ChartType; registerables: unknown[] };

let chartPromise: Promise<ChartModule> | null = null;

export async function loadChartJs(): Promise<ChartModule> {
	if (chartPromise) return chartPromise;
	chartPromise = new Promise<ChartModule>((resolve, reject) => {
		const win = window as unknown as Record<string, unknown>;
		if (win.Chart) {
			resolve({ Chart: win.Chart as unknown as ChartType, registerables: [] });
			return;
		}
		const script = document.createElement("script");
		script.src = "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js";
		script.onload = () => {
			const C = win.Chart as unknown as ChartType & { register(...items: unknown[]): void; registerables?: unknown[] };
			if (C && C.registerables) {
				C.register(...C.registerables);
			}
			resolve({ Chart: C as ChartType, registerables: [] });
		};
		script.onerror = reject;
		document.head.appendChild(script);
	});
	return chartPromise;
}

export async function renderProgressChart(
	canvas: HTMLCanvasElement,
	entries: ExerciseLogEntry[],
	label: string
): Promise<{ destroy(): void }> {
	const { Chart } = await loadChartJs();
	const data = entries
		.filter(e => e.sets.some(s => s.weight != null && s.reps != null))
		.map(e => ({
			x: e.date,
			y: Math.max(...e.sets
				.filter(s => s.weight != null && s.reps != null)
				.map(s => s.weight! * (1 + s.reps! / 30))
			),
		}))
		.reverse();

	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No canvas context");

	return new Chart(ctx, {
		type: "line",
		data: {
			datasets: [{
				label,
				data,
				tension: 0.3,
				borderColor: "var(--interactive-accent)",
				backgroundColor: "transparent",
				pointBackgroundColor: "var(--interactive-accent)",
				pointRadius: 3,
			}],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: { legend: { display: false } },
			scales: {
				x: {
					type: "category",
					ticks: { color: "var(--text-muted)", maxTicksLimit: 8 },
					grid: { color: CHART_GRID_COLOR },
				},
				y: {
					beginAtZero: false,
					ticks: { color: "var(--text-muted)" },
					grid: { color: CHART_GRID_COLOR },
				},
			},
		},
	} as Record<string, unknown>);
}

export async function renderVolumeChart(
	canvas: HTMLCanvasElement,
	weeklyVolumes: { week: string; volume: number }[]
): Promise<{ destroy(): void }> {
	const { Chart } = await loadChartJs();
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No canvas context");

	return new Chart(ctx, {
		type: "bar",
		data: {
			labels: weeklyVolumes.map(w => w.week),
			datasets: [{
				label: "Volume",
				data: weeklyVolumes.map(w => w.volume),
				backgroundColor: "var(--interactive-accent)",
				borderRadius: 4,
			}],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: { legend: { display: false } },
			scales: {
				x: {
					ticks: { color: "var(--text-muted)", maxTicksLimit: 12 },
					grid: { display: false },
				},
				y: {
					beginAtZero: true,
					ticks: { color: "var(--text-muted)" },
					grid: { color: CHART_GRID_COLOR },
				},
			},
		},
	} as Record<string, unknown>);
}

export async function renderCategoryChart(
	canvas: HTMLCanvasElement,
	categories: { name: string; volume: number }[]
): Promise<{ destroy(): void }> {
	const { Chart } = await loadChartJs();
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No canvas context");

	const colors = [
		"#ff6384", "#36a2eb", "#ffce56", "#4bc0c0",
		"#9966ff", "#ff9f40", "#c9cbcf", "#7bc043",
	];

	return new Chart(ctx, {
		type: "doughnut",
		data: {
			labels: categories.map(c => c.name),
			datasets: [{
				data: categories.map(c => c.volume),
				backgroundColor: categories.map((_, i) => colors[i % colors.length]),
				borderWidth: 0,
			}],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					position: "right",
					labels: { color: "var(--text-normal)" },
				},
			},
		},
	} as Record<string, unknown>);
}

function readInteractiveAccentRgb(anchor: HTMLElement): { r: number; g: number; b: number } {
	const el = document.createElement("span");
	el.style.cssText = "position:absolute;left:-9999px;top:0;color:var(--interactive-accent)";
	anchor.appendChild(el);
	const rgb = getComputedStyle(el).color;
	el.remove();
	const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
	if (m) return { r: +m[1], g: +m[2], b: +m[3] };
	return { r: 124, g: 108, b: 255 };
}

/** Smooth line chart for body metrics (tension avoids sharp corners at data points). */
export async function renderSmoothLineChart(
	canvas: HTMLCanvasElement,
	points: { x: string; y: number }[],
	_label: string
): Promise<{ destroy(): void }> {
	const { Chart } = await loadChartJs();
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No canvas context");

	const styleAnchor = (canvas.closest(".pulse-view-root") ?? canvas.parentElement ?? document.documentElement) as HTMLElement;
	const accent = readInteractiveAccentRgb(styleAnchor);
	const borderRgb = `rgb(${accent.r},${accent.g},${accent.b})`;

	return new Chart(ctx, {
		type: "line",
		data: {
			labels: points.map((p) => p.x),
			datasets: [{
				label: _label,
				data: points.map((p) => p.y),
				tension: 0.45,
				borderColor: borderRgb,
				backgroundColor: (context: {
					chart: { ctx: CanvasRenderingContext2D; chartArea: { top: number; bottom: number } | null };
				}) => {
					const chart = context.chart;
					const c = chart.ctx;
					const { chartArea } = chart;
					if (!chartArea) return "transparent";
					const { r, g, b } = accent;
					const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
					grad.addColorStop(0, `rgba(${r},${g},${b}, 0.42)`);
					grad.addColorStop(0.45, `rgba(${r},${g},${b}, 0.14)`);
					grad.addColorStop(1, `rgba(${r},${g},${b}, 0)`);
					return grad;
				},
				fill: true,
				pointRadius: 2,
				pointHoverRadius: 4,
				pointBackgroundColor: borderRgb,
				borderWidth: 2,
			}],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			interaction: { intersect: false, mode: "index" },
			plugins: { legend: { display: false } },
			scales: {
				x: {
					type: "category",
					ticks: {
						color: "var(--text-muted)",
						maxTicksLimit: 8,
						maxRotation: 0,
					},
					grid: { color: CHART_GRID_COLOR },
				},
				y: {
					beginAtZero: false,
					ticks: { color: "var(--text-muted)" },
					grid: { color: CHART_GRID_COLOR },
				},
			},
		},
	} as Record<string, unknown>);
}
