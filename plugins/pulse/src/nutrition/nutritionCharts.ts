import { loadChartJs } from "../workout/charts";

const CHART_GRID_COLOR =
	"color-mix(in srgb, var(--text-muted) 40%, var(--background-primary))";

const MACRO_COLORS = {
	protein: "#f97316",
	fat: "#22c55e",
	netCarbs: "#94a3b8",
} as const;

export interface MacroChartSlice {
	label: string;
	proteinCal: number;
	fatCal: number;
	netCarbsCal: number;
}

export async function renderMacroStackedBarChart(
	canvas: HTMLCanvasElement,
	slices: MacroChartSlice[],
	options?: {
		yTitle?: string;
		compact?: boolean;
		yMax?: number;
		goalCalories?: number;
		onBarClick?: (index: number, label: string) => void;
	}
): Promise<{ destroy(): void }> {
	const { Chart } = await loadChartJs();
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No canvas context");

	const goalCalories = options?.goalCalories;
	const yMax = options?.yMax ?? goalCalories;

	const goalLinePlugin = goalCalories != null
		? {
			id: "pulseNutritionGoalLine",
			afterDatasetsDraw(chart: {
				ctx: CanvasRenderingContext2D;
				chartArea: { left: number; right: number; top: number; bottom: number };
				scales: { y: { getPixelForValue: (v: number) => number } };
			}) {
				const yPos = chart.scales.y.getPixelForValue(goalCalories);
				const { left, right, top, bottom } = chart.chartArea;
				if (yPos < top - 1 || yPos > bottom + 1) return;
				const { ctx: c } = chart;
				c.save();
				c.strokeStyle = "rgba(140, 140, 150, 0.75)";
				c.lineWidth = 1.5;
				c.setLineDash([5, 4]);
				c.beginPath();
				c.moveTo(left, yPos);
				c.lineTo(right, yPos);
				c.stroke();
				c.restore();
			},
		}
		: undefined;

	return new Chart(ctx, {
		type: "bar",
		data: {
			labels: slices.map((s) => s.label),
			datasets: [
				{
					label: "Protein",
					data: slices.map((s) => Math.round(s.proteinCal)),
					backgroundColor: MACRO_COLORS.protein,
				},
				{
					label: "Fat",
					data: slices.map((s) => Math.round(s.fatCal)),
					backgroundColor: MACRO_COLORS.fat,
				},
				{
					label: "Net Carbs",
					data: slices.map((s) => Math.round(s.netCarbsCal)),
					backgroundColor: MACRO_COLORS.netCarbs,
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			onClick: options?.onBarClick
				? (_event: unknown, elements: { index: number }[]) => {
					const el = elements[0];
					if (!el) return;
					const label = slices[el.index]?.label;
					if (label) options.onBarClick!(el.index, label);
				}
				: undefined,
			plugins: {
				legend: {
					display: !options?.compact,
					position: "top",
					labels: { color: "var(--text-normal)", boxWidth: 12 },
				},
				tooltip: goalCalories != null
					? {
						callbacks: {
							footer(items: { dataset: { data: number[] }; dataIndex: number }[]) {
								if (items.length === 0) return "";
								const total = items.reduce((sum, item) => sum + (item.dataset.data[item.dataIndex] ?? 0), 0);
								const delta = total - goalCalories!;
								const sign = delta > 0 ? "+" : "";
								return `${Math.round(total)} cal · ${sign}${Math.round(delta)} vs goal`;
							},
						},
					}
					: undefined,
			},
			scales: {
				x: {
					stacked: true,
					ticks: {
						color: "var(--text-muted)",
						maxRotation: options?.compact ? 0 : 45,
						autoSkip: true,
					},
					grid: { display: false },
				},
				y: {
					stacked: true,
					beginAtZero: true,
					max: yMax,
					ticks: { color: "var(--text-muted)" },
					grid: { color: CHART_GRID_COLOR },
					title: options?.yTitle
						? { display: true, text: options.yTitle, color: "var(--text-muted)" }
						: undefined,
				},
			},
		},
		plugins: goalLinePlugin ? [goalLinePlugin] : undefined,
	} as Record<string, unknown>);
}

export async function renderMacroDoughnutChart(
	canvas: HTMLCanvasElement,
	proteinCal: number,
	fatCal: number,
	netCarbsCal: number
): Promise<{ destroy(): void }> {
	const { Chart } = await loadChartJs();
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("No canvas context");

	return new Chart(ctx, {
		type: "doughnut",
		data: {
			labels: ["Protein", "Fat", "Net Carbs"],
			datasets: [{
				data: [Math.round(proteinCal), Math.round(fatCal), Math.round(netCarbsCal)],
				backgroundColor: [MACRO_COLORS.protein, MACRO_COLORS.fat, MACRO_COLORS.netCarbs],
				borderWidth: 0,
			}],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					position: "right",
					labels: { color: "var(--text-normal)", boxWidth: 12 },
				},
			},
		},
	} as Record<string, unknown>);
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Small SVG macro donut for calendar cells (matches daily doughnut colors). */
export function renderMacroMiniDonut(
	proteinCal: number,
	fatCal: number,
	netCarbsCal: number,
	size = 40,
): SVGSVGElement {
	const stroke = Math.max(3.5, Math.round(size * 0.2));
	const r = (size - stroke) / 2;
	const cx = size / 2;
	const cy = size / 2;
	const circumference = 2 * Math.PI * r;

	const segments = [
		{ value: proteinCal, color: MACRO_COLORS.protein },
		{ value: fatCal, color: MACRO_COLORS.fat },
		{ value: netCarbsCal, color: MACRO_COLORS.netCarbs },
	].filter((s) => s.value > 0);

	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
	svg.setAttribute("class", "pulse-nutrition-cal__donut");
	svg.setAttribute("aria-hidden", "true");

	const track = document.createElementNS(SVG_NS, "circle");
	track.setAttribute("cx", String(cx));
	track.setAttribute("cy", String(cy));
	track.setAttribute("r", String(r));
	track.setAttribute("fill", "none");
	track.setAttribute("class", "pulse-nutrition-cal__donut-track");
	track.setAttribute("stroke-width", String(stroke));
	svg.appendChild(track);

	const total = segments.reduce((sum, s) => sum + s.value, 0);
	if (total <= 0) return svg;

	let offset = 0;
	for (const seg of segments) {
		const len = (seg.value / total) * circumference;
		const arc = document.createElementNS(SVG_NS, "circle");
		arc.setAttribute("cx", String(cx));
		arc.setAttribute("cy", String(cy));
		arc.setAttribute("r", String(r));
		arc.setAttribute("fill", "none");
		arc.setAttribute("stroke", seg.color);
		arc.setAttribute("stroke-width", String(stroke));
		arc.setAttribute("stroke-dasharray", `${len} ${circumference - len}`);
		arc.setAttribute("stroke-dashoffset", String(-offset));
		arc.setAttribute("transform", `rotate(-90 ${cx} ${cy})`);
		svg.appendChild(arc);
		offset += len;
	}

	return svg;
}
