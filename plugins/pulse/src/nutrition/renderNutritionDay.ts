import { TFile } from "obsidian";
import type PulsePlugin from "../main";
import { renderMacroDoughnutChart, renderMacroStackedBarChart } from "./nutritionCharts";
import {
	macroCaloriesFromGrams,
	sumMealMacros,
	type NutritionMealEntry,
} from "./types";

export async function renderNutritionDayBody(
	plugin: PulsePlugin,
	container: HTMLElement,
	date: string,
	meals: NutritionMealEntry[],
	monthPath: string | null
): Promise<{ destroy(): void }> {
	const charts: { destroy(): void }[] = [];
	container.empty();
	container.addClass("pulse-nutrition-day");

	const head = container.createDiv({ cls: "pulse-nutrition-day__head" });
	head.createEl("h2", { text: date, cls: "pulse-nutrition-day__title" });

	if (monthPath) {
		const actions = head.createDiv({ cls: "pulse-nutrition-day__actions" });
		const openNoteBtn = actions.createEl("button", {
			type: "button",
			cls: "pulse-workout-btn pulse-workout-btn-link",
		});
		openNoteBtn.createSpan({ text: "Open month note" });
		openNoteBtn.addEventListener("click", () => {
			const file = plugin.app.vault.getAbstractFileByPath(monthPath);
			if (file instanceof TFile) void plugin.app.workspace.getLeaf("tab").openFile(file);
		});
	}

	if (meals.length === 0) {
		container.createEl("p", {
			text: "No food logs for this day.",
			cls: "pulse-workout-muted",
		});
		return { destroy: () => charts.forEach((c) => c.destroy()) };
	}

	const dayTotals = sumMealMacros(meals);
	const dayMacroCals = macroCaloriesFromGrams(dayTotals);

	const totalsSection = container.createDiv({ cls: "pulse-nutrition-day__section" });
	totalsSection.createEl("h3", { text: "Day totals", cls: "pulse-pm__section-title" });

	const totalsGrid = totalsSection.createDiv({ cls: "pulse-nutrition-day__totals-grid" });
	const statDefs = [
		{ label: "Calories", value: `${Math.round(dayTotals.calories)}` },
		{ label: "Protein", value: `${Math.round(dayTotals.protein)}g` },
		{ label: "Fat", value: `${Math.round(dayTotals.fat)}g` },
		{ label: "Net carbs", value: `${Math.round(dayTotals.netCarbs)}g` },
	];
	for (const s of statDefs) {
		const card = totalsGrid.createDiv({ cls: "pulse-nutrition-day__stat" });
		card.createDiv({ cls: "pulse-nutrition-day__stat-label", text: s.label });
		card.createDiv({ cls: "pulse-nutrition-day__stat-value", text: s.value });
	}

	const chartsRow = totalsSection.createDiv({ cls: "pulse-nutrition-day__charts-row" });

	const barWrap = chartsRow.createDiv({ cls: "pulse-nutrition-day__chart-wrap" });
	barWrap.createEl("h4", { text: "Calories by macro", cls: "pulse-nutrition-day__chart-title" });
	const barContainer = barWrap.createDiv({ cls: "pulse-workout-chart-container pulse-nutrition-day__chart" });
	const barCanvas = barContainer.createEl("canvas");
	barCanvas.width = 400;
	barCanvas.height = 220;
	try {
		const chart = await renderMacroStackedBarChart(barCanvas, [{
			label: date.slice(5),
			proteinCal: dayMacroCals.protein,
			fatCal: dayMacroCals.fat,
			netCarbsCal: dayMacroCals.netCarbs,
		}], { yTitle: "Calories" });
		charts.push(chart);
	} catch (e) {
		console.warn("Nutrition day bar chart error:", e);
		barContainer.createEl("p", { text: "Chart unavailable", cls: "pulse-workout-muted" });
	}

	const doughWrap = chartsRow.createDiv({ cls: "pulse-nutrition-day__chart-wrap pulse-nutrition-day__chart-wrap--doughnut" });
	doughWrap.createEl("h4", { text: "Macro split", cls: "pulse-nutrition-day__chart-title" });
	const doughContainer = doughWrap.createDiv({ cls: "pulse-workout-chart-container pulse-nutrition-day__chart pulse-nutrition-day__chart--doughnut" });
	const doughCanvas = doughContainer.createEl("canvas");
	doughCanvas.width = 280;
	doughCanvas.height = 220;
	try {
		const chart = await renderMacroDoughnutChart(
			doughCanvas,
			dayMacroCals.protein,
			dayMacroCals.fat,
			dayMacroCals.netCarbs
		);
		charts.push(chart);
	} catch (e) {
		console.warn("Nutrition day doughnut chart error:", e);
		doughContainer.createEl("p", { text: "Chart unavailable", cls: "pulse-workout-muted" });
	}

	const mealsSection = container.createDiv({ cls: "pulse-nutrition-day__section" });
	mealsSection.createEl("h3", { text: "Meals", cls: "pulse-pm__section-title" });

	const mealChartSlices = meals.map((meal) => {
		const mc = macroCaloriesFromGrams(meal);
		return {
			label: meal.meal,
			proteinCal: mc.protein,
			fatCal: mc.fat,
			netCarbsCal: mc.netCarbs,
		};
	});

	const mealCompareWrap = mealsSection.createDiv({ cls: "pulse-nutrition-day__chart-wrap" });
	mealCompareWrap.createEl("h4", { text: "Calories by meal", cls: "pulse-nutrition-day__chart-title" });
	const mealCompareContainer = mealCompareWrap.createDiv({
		cls: "pulse-workout-chart-container pulse-nutrition-day__chart",
	});
	const mealCompareCanvas = mealCompareContainer.createEl("canvas");
	mealCompareCanvas.width = 500;
	mealCompareCanvas.height = 220;
	try {
		const chart = await renderMacroStackedBarChart(mealCompareCanvas, mealChartSlices, {
			yTitle: "Calories",
		});
		charts.push(chart);
	} catch (e) {
		console.warn("Nutrition meal compare chart error:", e);
		mealCompareContainer.createEl("p", { text: "Chart unavailable", cls: "pulse-workout-muted" });
	}

	for (const meal of meals) {
		const mealBlock = mealsSection.createDiv({ cls: "pulse-nutrition-day__meal" });

		const mealHead = mealBlock.createDiv({ cls: "pulse-nutrition-day__meal-head" });
		const titleRow = mealHead.createDiv({ cls: "pulse-nutrition-day__meal-title-row" });
		titleRow.createEl("h4", { text: meal.meal, cls: "pulse-nutrition-day__meal-title" });
		if (meal.time) {
			titleRow.createSpan({ text: meal.time, cls: "pulse-nutrition-day__meal-time" });
		}
		if (meal.summary) {
			mealHead.createDiv({ text: meal.summary, cls: "pulse-workout-muted pulse-nutrition-day__meal-summary" });
		}

		const mealStats = mealHead.createDiv({ cls: "pulse-nutrition-day__meal-stats" });
		mealStats.createSpan({ text: `${Math.round(meal.calories)} cal` });
		mealStats.createSpan({ text: `${Math.round(meal.protein)}p` });
		mealStats.createSpan({ text: `${Math.round(meal.fat)}f` });
		mealStats.createSpan({ text: `${Math.round(meal.netCarbs)}c` });

		if (meal.items.length > 0) {
			const foods = mealBlock.createDiv({ cls: "pulse-nutrition-day__foods" });
			foods.createEl("h5", { text: "Foods", cls: "pulse-nutrition-day__foods-title" });
			const list = foods.createEl("ul", { cls: "pulse-nutrition-day__food-list" });
			for (const item of meal.items) {
				const li = list.createEl("li", { cls: "pulse-nutrition-day__food-item" });
				const name = li.createSpan({ cls: "pulse-nutrition-day__food-name", text: item.name });
				const meta: string[] = [];
				if (item.calories) meta.push(`${Math.round(item.calories)} cal`);
				if (item.protein) meta.push(`${Math.round(item.protein)}p`);
				if (item.fat) meta.push(`${Math.round(item.fat)}f`);
				if (item.netCarbs) meta.push(`${Math.round(item.netCarbs)}c`);
				if (meta.length > 0) {
					li.createSpan({ cls: "pulse-nutrition-day__food-meta", text: meta.join(" · ") });
				}
				void name;
			}
		}

		const mealChartWrap = mealBlock.createDiv({ cls: "pulse-nutrition-day__chart-wrap pulse-nutrition-day__chart-wrap--meal" });
		const mc = macroCaloriesFromGrams(meal);
		const mealCanvasWrap = mealChartWrap.createDiv({
			cls: "pulse-workout-chart-container pulse-nutrition-day__chart pulse-nutrition-day__chart--meal",
		});
		const mealCanvas = mealCanvasWrap.createEl("canvas");
		mealCanvas.width = 320;
		mealCanvas.height = 160;
		try {
			const chart = await renderMacroStackedBarChart(mealCanvas, [{
				label: meal.meal,
				proteinCal: mc.protein,
				fatCal: mc.fat,
				netCarbsCal: mc.netCarbs,
			}], { compact: true, yTitle: "Cal" });
			charts.push(chart);
		} catch (e) {
			console.warn("Nutrition meal chart error:", e);
		}
	}

	return { destroy: () => charts.forEach((c) => c.destroy()) };
}

export function nutritionDayDisplayTitle(date: string): string {
	if (!date) return "Nutrition";
	const d = new Date(`${date}T12:00:00`);
	if (Number.isNaN(d.getTime())) return date;
	return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
