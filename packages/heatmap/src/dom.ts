import type {HeatmapGrid} from "./buildGrid";
import {computeMonthLabels, dowAbbreviationsForRows} from "./layout";

export type HeatmapDayFileRef = {
	path: string;
	title: string;
};

export type HeatmapDomOptions = {
	/** Sets `--suite-heatmap-accent` (e.g. from frontmatter or project color). */
	accentColor?: string;
	/** Accessible name for the graph. */
	ariaLabel?: string;
	/** Map local date → files counted that day (shown when a day cell is activated). */
	filesByDay?: ReadonlyMap<string, readonly HeatmapDayFileRef[]>;
	/** Called when an in-range day cell is clicked (or Enter/Space). */
	onDayClick?: (detail: {dateKey: string; files: HeatmapDayFileRef[]}) => void;
	/** Pass to `Intl.DateTimeFormat` for month row. */
	locale?: string;
};

const CELL_PX = 11;
const GAP_PX = 3;
const COL_STRIDE = CELL_PX + GAP_PX;

/**
 * GitHub-style contribution DOM with weekday labels, month headers, and optional day click.
 * Root element: `.suite-heatmap-wrap`.
 */
export function createHeatmapElement(grid: HeatmapGrid, options?: HeatmapDomOptions): HTMLElement {
	const wrap = document.createElement("div");
	wrap.className = "suite-heatmap-wrap";
	const n = grid.columns.length;
	wrap.style.setProperty("--suite-heatmap-cols", String(n));
	wrap.style.setProperty("--suite-heatmap-cell", `${CELL_PX}px`);
	wrap.style.setProperty("--suite-heatmap-gap", `${GAP_PX}px`);
	if (options?.accentColor?.trim()) {
		wrap.style.setProperty("--suite-heatmap-accent", options.accentColor.trim());
	}

	const corner = document.createElement("div");
	corner.className = "suite-heatmap__corner";
	corner.setAttribute("aria-hidden", "true");

	const monthRow = document.createElement("div");
	monthRow.className = "suite-heatmap__month-row";
	monthRow.setAttribute("aria-hidden", "true");
	const gridWidthPx = n * CELL_PX + Math.max(0, n - 1) * GAP_PX;
	monthRow.style.width = `${gridWidthPx}px`;

	for (const m of computeMonthLabels(grid, options?.locale)) {
		const span = document.createElement("span");
		span.className = "suite-heatmap__month-label";
		span.textContent = m.label;
		span.style.left = `${m.columnIndex * COL_STRIDE}px`;
		monthRow.appendChild(span);
	}

	const dowCol = document.createElement("div");
	dowCol.className = "suite-heatmap__dow-col";
	dowCol.setAttribute("aria-hidden", "true");
	for (const ch of dowAbbreviationsForRows(grid.firstDayOfWeek)) {
		const s = document.createElement("span");
		s.className = "suite-heatmap__dow-label";
		s.textContent = ch;
		dowCol.appendChild(s);
	}

	const gridEl = document.createElement("div");
	gridEl.className = "suite-heatmap";
	gridEl.setAttribute("role", "img");
	gridEl.setAttribute(
		"aria-label",
		options?.ariaLabel ??
			`Activity from ${grid.rangeStartKey} to ${grid.rangeEndKey}, one column per week`,
	);

	const filesByDay = options?.filesByDay;
	const onDayClick = options?.onDayClick;

	for (const week of grid.columns) {
		const colEl = document.createElement("div");
		colEl.className = "suite-heatmap__week";
		for (const cell of week) {
			const dayEl = document.createElement("div");
			dayEl.className = "suite-heatmap__day";
			if (!cell.inRange) dayEl.classList.add("suite-heatmap__day--out");
			dayEl.dataset.level = String(cell.level);
			const label = cell.inRange
				? `${cell.dateKey} — ${cell.count === 0 ? "No activity" : `${cell.count} ${cell.count === 1 ? "interaction" : "interactions"}`}`
				: `${cell.dateKey} (outside range)`;
			dayEl.title = label;

			if (cell.inRange && onDayClick) {
				const files = filesByDay?.get(cell.dateKey)
					? [...filesByDay.get(cell.dateKey)!]
					: [];
				dayEl.classList.add("suite-heatmap__day--clickable");
				dayEl.setAttribute("role", "button");
				dayEl.tabIndex = 0;
				const activate = (): void => {
					onDayClick({dateKey: cell.dateKey, files});
				};
				dayEl.addEventListener("click", (e) => {
					e.stopPropagation();
					activate();
				});
				dayEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						activate();
					}
				});
			}

			colEl.appendChild(dayEl);
		}
		gridEl.appendChild(colEl);
	}

	const topRow = document.createElement("div");
	topRow.className = "suite-heatmap__top";
	topRow.appendChild(corner);
	topRow.appendChild(monthRow);

	const bottomRow = document.createElement("div");
	bottomRow.className = "suite-heatmap__bottom";
	bottomRow.appendChild(dowCol);
	bottomRow.appendChild(gridEl);

	wrap.appendChild(topRow);
	wrap.appendChild(bottomRow);

	return wrap;
}
