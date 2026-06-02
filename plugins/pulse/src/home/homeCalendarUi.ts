import { setIcon } from "obsidian";
import type { BodyCompDay } from "../stats/bodyCompTypes";
import {
	macroCaloriesFromGrams,
	sumMealMacros,
	type MacroTotals,
	type NutritionMealEntry,
} from "../nutrition/types";
import type { WorkoutListEntry } from "../workout/types";
import { formatWorkoutStatsLine } from "../workout/workoutListUi";
import { formatBodyCompCardLines } from "./homeActivity";

const MACRO_COLORS = {
	protein: "#f97316",
	fat: "#22c55e",
	netCarbs: "#94a3b8",
} as const;

export interface HomeWorkoutCalendarCardOptions {
	weightUnit: "lb" | "kg";
	getIconUrl?: (iconName: string) => string | null;
}

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

export function renderHomeWorkoutCalendarCard(
	parent: HTMLElement,
	entry: WorkoutListEntry,
	opts: HomeWorkoutCalendarCardOptions,
	onClick: () => void,
): void {
	const card = parent.createDiv({ cls: "pulse-cal__card pulse-cal__card--workout" });
	card.setAttribute("role", "button");
	card.setAttribute("tabindex", "0");
	card.setAttribute("title", entry.displayName);

	const row = card.createDiv({ cls: "pulse-cal__card-workout-row" });
	const iconWrap = row.createDiv({ cls: "pulse-cal__card-workout-icon" });
	const iconUrl =
		entry.iconName && opts.getIconUrl ? opts.getIconUrl(entry.iconName) : null;
	if (iconUrl) {
		iconWrap.createEl("img", {
			cls: "pulse-cal__card-workout-icon-img",
			attr: { src: iconUrl, alt: "", loading: "lazy" },
		});
	} else {
		setIcon(iconWrap, "dumbbell");
	}

	const textCol = row.createDiv({ cls: "pulse-cal__card-workout-text" });
	textCol.createDiv({ cls: "pulse-cal__card-workout-name", text: entry.displayName });
	const stats = formatWorkoutStatsLine(entry, opts.weightUnit);
	if (stats) {
		textCol.createDiv({ cls: "pulse-cal__card-workout-meta", text: stats });
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

/** @deprecated Use {@link renderHomeWorkoutCalendarCard} */
export function renderHomeWorkoutCalendarChip(
	parent: HTMLElement,
	entry: WorkoutListEntry,
	onClick: () => void,
): void {
	renderHomeWorkoutCalendarCard(
		parent,
		entry,
		{ weightUnit: "lb" },
		onClick,
	);
}
