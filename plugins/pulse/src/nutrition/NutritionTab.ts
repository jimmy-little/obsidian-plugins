import { setIcon } from "obsidian";
import type PulsePlugin from "../main";
import {
	buildCalendarGridCells,
	DAY_ABBREVS,
	formatMonthTitle,
	toIsoDateLocal,
} from "../workout/historyCalendar";
import {
	getStoredNutritionMonth,
	setStoredNutritionMonth,
} from "./NutritionDataManager";
import {
	groupMealsByDate,
	macroCaloriesFromGrams,
	sumMealMacros,
	type NutritionMealEntry,
} from "./types";
import { renderMacroStackedBarChart, renderMacroMiniDonut } from "./nutritionCharts";

export class NutritionTab {
	private plugin: PulsePlugin;
	private container: HTMLElement | null = null;
	private calendarYear: number;
	private calendarMonth: number;
	private onMonthChange?: () => void;
	private monthChart: { destroy(): void } | null = null;

	constructor(plugin: PulsePlugin, onMonthChange?: () => void) {
		this.plugin = plugin;
		const stored = getStoredNutritionMonth();
		this.calendarYear = stored.year;
		this.calendarMonth = stored.month;
		this.onMonthChange = onMonthChange;
	}

	async render(container: HTMLElement): Promise<void> {
		this.container = container;
		container.empty();
		container.createDiv({ cls: "pulse-workout-loading", text: "Loading nutrition logs..." });

		const meals = await this.plugin.nutritionDataManager.loadMonthEntries(
			this.calendarYear,
			this.calendarMonth
		);

		container.empty();
		this.renderLoaded(container, meals);
	}

	private renderLoaded(container: HTMLElement, meals: NutritionMealEntry[]): void {
		const wrapper = container.createDiv({ cls: "pulse-nutrition-wrap" });
		const byDate = groupMealsByDate(meals);
		this.renderCalendar(wrapper, byDate);
		void this.renderMonthChart(wrapper, byDate);

		const monthPath = this.plugin.nutritionDataManager.resolveMonthNotePath(
			this.calendarYear,
			this.calendarMonth
		);
		const foot = wrapper.createDiv({ cls: "pulse-nutrition-foot" });
		foot.createSpan({
			text: `Source: ${monthPath}`,
			cls: "pulse-workout-muted",
		});

		const goalLine = foot.createDiv({ cls: "pulse-nutrition-foot__goal pulse-workout-muted" });
		goalLine.appendText("Adjust daily goal in ");
		const settingsLink = goalLine.createEl("a", {
			cls: "pulse-nutrition-foot__settings-link",
			text: "settings",
			href: "#",
		});
		settingsLink.addEventListener("click", (e) => {
			e.preventDefault();
			this.plugin.openSettingsTab();
		});
		goalLine.appendText(".");
	}

	private async renderMonthChart(
		parent: HTMLElement,
		byDate: Map<string, NutritionMealEntry[]>
	): Promise<void> {
		this.monthChart?.destroy();
		this.monthChart = null;

		const dates = [...byDate.keys()].sort();
		const goal = this.plugin.settings.nutritionDailyCalorieGoal ?? 2000;

		const section = parent.createDiv({ cls: "pulse-nutrition-month-chart" });
		section.createEl("h3", {
			text: "Daily totals",
			cls: "pulse-pm__section-title",
		});

		if (dates.length === 0) {
			section.createEl("p", {
				text: "No logged days this month.",
				cls: "pulse-workout-muted",
			});
			return;
		}

		const slices = dates.map((date) => {
			const totals = sumMealMacros(byDate.get(date)!);
			const mc = macroCaloriesFromGrams(totals);
			return {
				date,
				label: date.slice(5),
				proteinCal: mc.protein,
				fatCal: mc.fat,
				netCarbsCal: mc.netCarbs,
			};
		});

		const chartContainer = section.createDiv({
			cls: "pulse-workout-chart-container pulse-nutrition-month-chart__canvas-wrap",
		});
		const canvas = chartContainer.createEl("canvas");
		canvas.width = 700;
		canvas.height = 260;

		try {
			this.monthChart = await renderMacroStackedBarChart(
				canvas,
				slices,
				{
					yTitle: "Calories",
					yMax: goal,
					goalCalories: goal,
					onBarClick: (_index, label) => {
						const match = slices.find((s) => s.label === label);
						if (match) void this.plugin.openNutritionDayView(match.date);
					},
				}
			);
		} catch (e) {
			console.warn("Nutrition month chart error:", e);
			chartContainer.createEl("p", { text: "Chart unavailable", cls: "pulse-workout-muted" });
		}
	}

	private renderCalendar(
		parent: HTMLElement,
		byDate: Map<string, NutritionMealEntry[]>
	): void {
		const y = this.calendarYear;
		const m = this.calendarMonth;

		const section = parent.createDiv({ cls: "pulse-cal pulse-nutrition-cal" });
		const head = section.createDiv({ cls: "pulse-cal__head" });

		const prevBtn = head.createEl("button", {
			type: "button",
			cls: "pulse-cal__nav-btn clickable-icon",
			attr: { "aria-label": "Previous month" },
		});
		setIcon(prevBtn, "chevron-left");

		head.createDiv({ cls: "pulse-cal__title", text: formatMonthTitle(y, m) });

		const nextBtn = head.createEl("button", {
			type: "button",
			cls: "pulse-cal__nav-btn clickable-icon",
			attr: { "aria-label": "Next month" },
		});
		setIcon(nextBtn, "chevron-right");

		const shiftMonth = async (delta: number): Promise<void> => {
			let nm = m + delta;
			let ny = y;
			if (nm < 0) {
				nm = 11;
				ny--;
			} else if (nm > 11) {
				nm = 0;
				ny++;
			}
			this.calendarYear = ny;
			this.calendarMonth = nm;
			setStoredNutritionMonth(ny, nm);
			this.onMonthChange?.();
			if (!this.container) return;
			await this.render(this.container);
		};

		prevBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void shiftMonth(-1);
		});
		nextBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void shiftMonth(1);
		});

		const grid = section.createDiv({ cls: "pulse-cal__grid" });
		const weekdays = grid.createDiv({ cls: "pulse-cal__weekdays" });
		for (const d of DAY_ABBREVS) {
			weekdays.createDiv({ cls: "pulse-cal__weekday", text: d });
		}

		const cells = grid.createDiv({ cls: "pulse-cal__cells" });
		const dayCells = buildCalendarGridCells(y, m);

		for (const dayOrNull of dayCells) {
			const cell = cells.createDiv({ cls: "pulse-cal__cell pulse-nutrition-cal__cell" });
			if (dayOrNull == null) {
				cell.addClass("pulse-cal__cell--empty");
				continue;
			}

			const dateStr = toIsoDateLocal(y, m, dayOrNull);
			cell.createDiv({ cls: "pulse-cal__day-num", text: String(dayOrNull) });

			const dayMeals = byDate.get(dateStr) ?? [];
			if (dayMeals.length === 0) continue;

			const totals = sumMealMacros(dayMeals);
			const mc = macroCaloriesFromGrams(totals);
			cell.addClass("pulse-nutrition-cal__cell--logged");
			cell.setAttribute("role", "button");
			cell.setAttribute("tabindex", "0");
			cell.setAttribute("title", formatDayMacroSummary(dayMeals));

			const dayCard = cell.createDiv({ cls: "pulse-nutrition-cal__day-card" });
			dayCard.createDiv({
				cls: "pulse-nutrition-cal__day-kcal",
				text: `${Math.round(totals.calories)} cal`,
			});

			const donutWrap = dayCard.createDiv({ cls: "pulse-nutrition-cal__donut-wrap" });
			donutWrap.appendChild(renderMacroMiniDonut(mc.protein, mc.fat, mc.netCarbs));

			dayCard.createDiv({
				cls: "pulse-nutrition-cal__day-macros",
				text: `${Math.round(totals.protein)}g P · ${Math.round(totals.fat)}g F · ${Math.round(totals.netCarbs)}g C`,
			});

			const openDay = () => void this.plugin.openNutritionDayView(dateStr);
			cell.addEventListener("click", openDay);
			cell.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					openDay();
				}
			});
		}
	}

	getCalendarMonth(): { year: number; month: number } {
		return { year: this.calendarYear, month: this.calendarMonth };
	}

	destroy(): void {
		this.monthChart?.destroy();
		this.monthChart = null;
		this.container = null;
	}
}

export function formatDayMacroSummary(meals: NutritionMealEntry[]): string {
	const t = sumMealMacros(meals);
	const cals = macroCaloriesFromGrams(t);
	const macroCalTotal = cals.protein + cals.fat + cals.netCarbs;
	return `${Math.round(t.calories)} cal · ${Math.round(t.protein)}p · ${Math.round(t.fat)}f · ${Math.round(t.netCarbs)}c (${Math.round(macroCalTotal)} from macros)`;
}
