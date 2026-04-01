import type { ExerciseLogEntry } from "./types";

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
					grid: { color: "var(--background-modifier-border)" },
				},
				y: {
					beginAtZero: false,
					ticks: { color: "var(--text-muted)" },
					grid: { color: "var(--background-modifier-border)" },
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
					grid: { color: "var(--background-modifier-border)" },
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
