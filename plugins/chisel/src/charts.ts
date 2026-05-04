import type { PayoffMonthRow } from "./math/payoffSimulation";

const CHART_GRID_COLOR =
	"color-mix(in srgb, var(--text-muted) 40%, var(--background-primary))";

type ChartType = {
	new (ctx: CanvasRenderingContext2D, config: Record<string, unknown>): { destroy(): void };
};
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
			const C = win.Chart as unknown as ChartType & {
				register(...items: unknown[]): void;
				registerables?: unknown[];
			};
			if (C?.registerables) {
				C.register(...C.registerables);
			}
			resolve({ Chart: C as ChartType, registerables: [] });
		};
		script.onerror = reject;
		document.head.appendChild(script);
	});
	return chartPromise;
}

export type BalanceChartSeries = {
	label: string;
	rows: PayoffMonthRow[];
	borderColor: string;
};

export async function renderBalancePayoffChart(
	canvas: HTMLCanvasElement,
	series: BalanceChartSeries[],
): Promise<{ destroy(): void }> {
	const { Chart } = await loadChartJs();
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No canvas context");

	const maxLen = Math.max(0, ...series.map((s) => s.rows.length));
	const labels = maxLen === 0 ? [] : Array.from({ length: maxLen }, (_, i) => String(i + 1));

	const datasets = series.map((s) => ({
		label: s.label,
		data: Array.from({ length: maxLen }, (_, i) => s.rows[i]?.balanceAfter ?? null),
		tension: 0.25,
		borderColor: s.borderColor,
		backgroundColor: "transparent",
		pointRadius: 2,
		spanGaps: true,
	}));

	return new Chart(ctx, {
		type: "line",
		data: { labels, datasets },
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: series.length > 1, labels: { color: "var(--text-muted)" } },
				tooltip: { enabled: true },
			},
			scales: {
				x: {
					title: { display: true, text: "Payment #", color: "var(--text-muted)" },
					ticks: { color: "var(--text-muted)", maxTicksLimit: 12 },
					grid: { color: CHART_GRID_COLOR },
				},
				y: {
					beginAtZero: true,
					title: { display: true, text: "Balance", color: "var(--text-muted)" },
					ticks: { color: "var(--text-muted)" },
					grid: { color: CHART_GRID_COLOR },
				},
			},
		},
	} as Record<string, unknown>);
}

export type LineSeries = { label: string; data: (number | null)[]; borderColor: string };

export async function renderMultiLineNumericChart(
	canvas: HTMLCanvasElement,
	labels: string[],
	series: LineSeries[],
	yTitle: string,
): Promise<{ destroy(): void }> {
	const { Chart } = await loadChartJs();
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No canvas context");

	const datasets = series.map((s) => ({
		label: s.label,
		data: s.data,
		tension: 0.25,
		borderColor: s.borderColor,
		backgroundColor: "transparent",
		pointRadius: 2,
		spanGaps: true,
	}));

	return new Chart(ctx, {
		type: "line",
		data: { labels, datasets },
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: series.length > 1, labels: { color: "var(--text-muted)" } },
			},
			scales: {
				x: {
					ticks: { color: "var(--text-muted)", maxTicksLimit: 14 },
					grid: { color: CHART_GRID_COLOR },
				},
				y: {
					beginAtZero: true,
					title: { display: true, text: yTitle, color: "var(--text-muted)" },
					ticks: { color: "var(--text-muted)" },
					grid: { color: CHART_GRID_COLOR },
				},
			},
		},
	} as Record<string, unknown>);
}

export async function renderHorizontalBarChart(
	canvas: HTMLCanvasElement,
	items: { label: string; value: number }[],
): Promise<{ destroy(): void }> {
	const { Chart } = await loadChartJs();
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No canvas context");

	return new Chart(ctx, {
		type: "bar",
		data: {
			labels: items.map((i) => i.label),
			datasets: [
				{
					label: "Balance",
					data: items.map((i) => i.value),
					backgroundColor: "color-mix(in srgb, var(--interactive-accent) 45%, var(--background-secondary))",
					borderColor: "var(--interactive-accent)",
					borderWidth: 1,
				},
			],
		},
		options: {
			indexAxis: "y",
			responsive: true,
			maintainAspectRatio: false,
			plugins: { legend: { display: false } },
			scales: {
				x: {
					beginAtZero: true,
					ticks: { color: "var(--text-muted)" },
					grid: { color: CHART_GRID_COLOR },
				},
				y: {
					ticks: { color: "var(--text-muted)" },
					grid: { display: false },
				},
			},
		},
	} as Record<string, unknown>);
}
