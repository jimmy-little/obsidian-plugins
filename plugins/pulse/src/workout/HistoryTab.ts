import { setIcon } from "obsidian";
import type PulsePlugin from "../main";
import type { PulseView } from "../views/PulseView";
import type { WorkoutListEntry } from "./types";
import { HOME_TIMELINE_DAYS, formatWorkoutDateGroupLabel } from "./workoutListUi";
import {
	buildCalendarGridCells,
	buildWorkoutsByDate,
	DAY_ABBREVS,
	formatMonthTitle,
	toIsoDateLocal,
} from "./historyCalendar";
import { groupMealsByDate, type NutritionMealEntry } from "../nutrition/types";
import { getStatsNotePath } from "../import/parsers";
import { loadBodyCompSeries } from "../stats/loadBodyCompSeries";
import type { BodyCompDay } from "../stats/bodyCompTypes";
import {
	bodyCompByDateFromSeries,
	buildHomeTimelineItems,
	groupHomeTimelineByDate,
	loadNutritionByDateForRange,
} from "../home/homeActivity";
import {
	renderHomeBodyCompCalendarCard,
	renderHomeNutritionCalendarCard,
	renderHomeWorkoutCalendarChip,
} from "../home/homeCalendarUi";
import { openStatsNotePath, renderHomeActivityTimeline } from "../home/homeTimelineUi";

export class HistoryTab {
	private plugin: PulsePlugin;
	private view: PulseView | null;
	private container: HTMLElement | null = null;
	private calendarYear: number | null = null;
	private calendarMonth: number | null = null;
	private entries: WorkoutListEntry[] = [];

	constructor(plugin: PulsePlugin, view?: PulseView) {
		this.plugin = plugin;
		this.view = view ?? null;
	}

	render(container: HTMLElement, entries?: WorkoutListEntry[]): void {
		this.container = container;
		this.entries = entries ?? this.plugin.workoutDataManager.getAllWorkoutListEntries();

		if (this.calendarYear == null || this.calendarMonth == null) {
			const n = new Date();
			this.calendarYear = n.getFullYear();
			this.calendarMonth = n.getMonth();
		}

		container.empty();
		const loading = container.createDiv({
			text: "Loading activity…",
			cls: "pulse-workout-loading",
		});
		void this.renderAsync(container, loading, this.entries);
	}

	private async renderAsync(
		container: HTMLElement,
		loading: HTMLElement,
		entries: WorkoutListEntry[],
	): Promise<void> {
		try {
			const y = this.calendarYear!;
			const m = this.calendarMonth!;
			const ndm = this.plugin.nutritionDataManager;
			const monthMeals = await ndm.loadMonthEntries(y, m);
			const nutritionByDate = groupMealsByDate(monthMeals);

			const template =
				this.plugin.settings.statsNotePathTemplate?.trim() ||
				"60 Logs/{year}/Stats/{month}/{date}.md";
			const bodyCompSeries = await loadBodyCompSeries(this.plugin.app.vault, template);
			const bodyCompByDate = bodyCompByDateFromSeries(bodyCompSeries);

			const today = new Date();
			const endDate = toIsoDateLocal(
				today.getFullYear(),
				today.getMonth(),
				today.getDate(),
			);
			const cutoff = new Date();
			cutoff.setHours(0, 0, 0, 0);
			cutoff.setDate(cutoff.getDate() - (HOME_TIMELINE_DAYS - 1));
			const startDate = toIsoDateLocal(
				cutoff.getFullYear(),
				cutoff.getMonth(),
				cutoff.getDate(),
			);
			const timelineNutrition = await loadNutritionByDateForRange(
				(yr, mo) => ndm.loadMonthEntries(yr, mo),
				startDate,
				endDate,
			);

			loading.remove();
			this.renderLoaded(container, entries, nutritionByDate, bodyCompByDate, timelineNutrition);
		} catch (e) {
			console.error(e);
			loading.setText("Could not load home activity.");
		}
	}

	private renderLoaded(
		container: HTMLElement,
		entries: WorkoutListEntry[],
		nutritionByDate: Map<string, NutritionMealEntry[]>,
		bodyCompByDate: Map<string, BodyCompDay>,
		timelineNutrition: Map<string, NutritionMealEntry[]>,
	): void {
		const wrapper = container.createDiv({ cls: "pulse-workout-history-wrap" });

		this.renderCalendar(wrapper, entries, nutritionByDate, bodyCompByDate);

		const logSection = wrapper.createDiv({ cls: "pulse-workout-history-log" });
		logSection.createEl("h3", { text: "Activity", cls: "pulse-workout-history-log-title" });

		const listHost = logSection.createDiv({ cls: "pulse-workout-history" });
		const statsTemplate =
			this.plugin.settings.statsNotePathTemplate?.trim() ||
			"60 Logs/{year}/Stats/{month}/{date}.md";
		const timelineItems = buildHomeTimelineItems(
			entries,
			timelineNutrition,
			bodyCompByDate,
			statsTemplate,
			HOME_TIMELINE_DAYS,
		);
		const workoutByPath = new Map(entries.map((e) => [e.path, e]));
		const groups = groupHomeTimelineByDate(timelineItems, formatWorkoutDateGroupLabel);

		renderHomeActivityTimeline(listHost, groups, {
			weightUnit: this.plugin.settings.weightUnit,
			onOpenWorkout: (path) => this.openSession(path),
			onOpenNutritionDay: (date) => void this.plugin.openNutritionDayView(date),
			onOpenStatsNote: (path) => openStatsNotePath(this.plugin.app, path),
			getWorkoutIconUrl: (iconName) => this.plugin.importManager.getActivityIconUrl(iconName),
			workoutMetaByPath: workoutByPath,
		});

		const hasOlderWorkouts = entries.some((e) => {
			const cutoff = new Date();
			cutoff.setHours(0, 0, 0, 0);
			cutoff.setDate(cutoff.getDate() - (HOME_TIMELINE_DAYS - 1));
			const cutoffIso = toIsoDateLocal(
				cutoff.getFullYear(),
				cutoff.getMonth(),
				cutoff.getDate(),
			);
			return e.date < cutoffIso;
		});
		if (hasOlderWorkouts) {
			logSection.createDiv({
				cls: "pulse-workout-muted pulse-workout-history-cap-hint",
				text: `Showing the last ${HOME_TIMELINE_DAYS} days. Use the sidebar for the full workout list.`,
			});
		}
	}

	private openSession(path: string): void {
		if (this.view) {
			this.view.navigate("session", path);
			return;
		}
		void this.plugin.openPulseView("session", path);
	}

	private renderCalendar(
		parent: HTMLElement,
		entries: WorkoutListEntry[],
		nutritionByDate: Map<string, NutritionMealEntry[]>,
		bodyCompByDate: Map<string, BodyCompDay>,
	): void {
		const y = this.calendarYear!;
		const m = this.calendarMonth!;

		const section = parent.createDiv({ cls: "pulse-cal pulse-home-cal" });
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

		const shiftMonth = (delta: number): void => {
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
			if (!this.container) return;
			this.render(this.container, this.entries);
		};

		prevBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			shiftMonth(-1);
		});
		nextBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			shiftMonth(1);
		});

		const byDate = buildWorkoutsByDate(entries);

		const grid = section.createDiv({ cls: "pulse-cal__grid" });
		const weekdays = grid.createDiv({ cls: "pulse-cal__weekdays" });
		for (const d of DAY_ABBREVS) {
			weekdays.createDiv({ cls: "pulse-cal__weekday", text: d });
		}

		const cells = grid.createDiv({ cls: "pulse-cal__cells" });
		const dayCells = buildCalendarGridCells(y, m);

		for (const dayOrNull of dayCells) {
			const cell = cells.createDiv({ cls: "pulse-cal__cell pulse-home-cal__cell" });
			if (dayOrNull == null) {
				cell.addClass("pulse-cal__cell--empty");
				continue;
			}

			const dateStr = toIsoDateLocal(y, m, dayOrNull);
			cell.createDiv({ cls: "pulse-cal__day-num", text: String(dayOrNull) });

			const marks = cell.createDiv({ cls: "pulse-cal__marks" });
			let hasMarks = false;

			const bodyRow = bodyCompByDate.get(dateStr);
			if (bodyRow) {
				const statsTemplate =
					this.plugin.settings.statsNotePathTemplate?.trim() ||
					"60 Logs/{year}/Stats/{month}/{date}.md";
				renderHomeBodyCompCalendarCard(marks, bodyRow, () => {
					openStatsNotePath(
						this.plugin.app,
						getStatsNotePath(new Date(`${dateStr}T12:00:00`), statsTemplate),
					);
				});
				hasMarks = true;
			}

			const dayMeals = nutritionByDate.get(dateStr) ?? [];
			if (dayMeals.length > 0) {
				renderHomeNutritionCalendarCard(marks, dayMeals, () => {
					void this.plugin.openNutritionDayView(dateStr);
				});
				hasMarks = true;
			}

			for (const entry of byDate.get(dateStr) ?? []) {
				renderHomeWorkoutCalendarChip(marks, entry, () => this.openSession(entry.path));
				hasMarks = true;
			}

			if (!hasMarks) {
				marks.addClass("pulse-cal__marks--empty");
			}
		}

		section.createDiv({
			cls: "pulse-cal__hint pulse-workout-muted",
			text: "Click a card to open workouts, nutrition, or body stats for that day.",
		});
	}

	destroy(): void {
		this.container = null;
		this.calendarYear = null;
		this.calendarMonth = null;
		this.entries = [];
	}
}
