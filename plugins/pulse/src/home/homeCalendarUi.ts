import type { BodyCompDay } from "../stats/bodyCompTypes";
import {
	macroCaloriesFromGrams,
	sumMealMacros,
	type MacroTotals,
	type NutritionMealEntry,
} from "../nutrition/types";
import type { WorkoutListEntry } from "../workout/types";
import { formatBodyCompCardLines } from "./homeActivity";

const MACRO_COLORS = {
	protein: "#f97316",
	fat: "#22c55e",
	netCarbs: "#94a3b8",
} as const;

export function renderMacroMiniStackBar(parent: HTMLElement, totals: MacroTotals): void {
	const mc = macroCaloriesFromGrams(totals);
	const total = mc.protein + mc.fat + mc.netCarbs;
	if (total <= 0) return;

	const bar = parent.createDiv({ cls: "pulse-cal__macro-bar", attr: { "aria-hidden": "true" } });
	const segs: { key: keyof typeof MACRO_COLORS; value: number }[] = [
		{ key: "protein", value: mc.protein },
		{ key: "fat", value: mc.fat },
		{ key: "netCarbs", value: mc.netCarbs },
	];
	for (const seg of segs) {
		if (seg.value <= 0) continue;
		bar.createDiv({
			cls: `pulse-cal__macro-seg pulse-cal__macro-seg--${seg.key}`,
			attr: {
				style: `flex: ${seg.value} 1 0; background: ${MACRO_COLORS[seg.key]}`,
			},
		});
	}
}

export function renderHomeNutritionCalendarCard(
	parent: HTMLElement,
	meals: NutritionMealEntry[],
	onClick: () => void,
): void {
	if (meals.length === 0) return;
	const totals = sumMealMacros(meals);
	const card = parent.createDiv({ cls: "pulse-cal__card pulse-cal__card--nutrition" });
	card.setAttribute("role", "button");
	card.setAttribute("tabindex", "0");
	card.setAttribute("title", "Open nutrition day");

	card.createDiv({
		cls: "pulse-cal__card-kcal",
		text: `${Math.round(totals.calories)}kcal`,
	});
	renderMacroMiniStackBar(card, totals);

	const open = (e?: Event): void => {
		e?.stopPropagation();
		onClick();
	};
	card.addEventListener("click", open);
	card.addEventListener("keydown", (e: KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			open(e);
		}
	});
}

export function renderHomeBodyCompCalendarCard(
	parent: HTMLElement,
	row: BodyCompDay,
	onClick: () => void,
): void {
	const lines = formatBodyCompCardLines(row);
	if (!lines) return;

	const card = parent.createDiv({ cls: "pulse-cal__card pulse-cal__card--body" });
	card.setAttribute("role", "button");
	card.setAttribute("tabindex", "0");
	card.setAttribute("title", "Open stats note");

	if (lines.primary) {
		card.createDiv({ cls: "pulse-cal__card-weight", text: lines.primary });
	}
	if (lines.secondary) {
		card.createDiv({ cls: "pulse-cal__card-bfp", text: lines.secondary });
	}

	const open = (e?: Event): void => {
		e?.stopPropagation();
		onClick();
	};
	card.addEventListener("click", open);
	card.addEventListener("keydown", (e: KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			open(e);
		}
	});
}

export function renderHomeWorkoutCalendarChip(
	parent: HTMLElement,
	entry: WorkoutListEntry,
	onClick: () => void,
): void {
	const chip = parent.createDiv({ cls: "pulse-cal__chip pulse-cal__chip--done pulse-cal__chip--workout" });
	chip.setAttribute("title", entry.file.basename);
	chip.setText(entry.displayName);
	chip.addEventListener("click", (e) => {
		e.stopPropagation();
		onClick();
	});
}
