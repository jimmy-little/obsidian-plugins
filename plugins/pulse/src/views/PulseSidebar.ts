import type PulsePlugin from "../main";
import type { PulseView } from "./PulseView";
import type { PulseViewMode } from "./PulseView";
import type { ExerciseNote, WorkoutListEntry } from "../workout/types";
import {
	type ExerciseGroupBy,
	exerciseMatchesFilter,
	getStoredExerciseGroupBy,
	groupExercisesBy,
	setStoredExerciseGroupBy,
} from "../workout/exerciseListUi";
import { renderWorkoutSidebarList } from "../workout/workoutListUi";
import { WorkoutMergeModal } from "../workout/workoutMergeModal";
import { WorkoutDeleteConfirmModal } from "../workout/workoutSessionModals";
import { getStoredNutritionMonth } from "../nutrition/NutritionDataManager";
import { groupMealsByDate } from "../nutrition/types";
import { Notice } from "obsidian";

const SIDEBAR_SEGMENT_KEY = "pulse-sidebar-segment";

export type PulseSidebarSegment = "workouts" | "exercises";

function getSidebarSegment(): PulseSidebarSegment {
	try {
		const v = localStorage.getItem(SIDEBAR_SEGMENT_KEY);
		if (v === "exercises") return "exercises";
	} catch {
		/* ignore */
	}
	return "workouts";
}

function setSidebarSegment(s: PulseSidebarSegment): void {
	try {
		localStorage.setItem(SIDEBAR_SEGMENT_KEY, s);
	} catch {
		/* ignore */
	}
}

export class PulseSidebar {
	private plugin: PulsePlugin;
	private view: PulseView;
	private container: HTMLElement | null = null;
	private savedSegmentScrollTop = 0;

	constructor(plugin: PulsePlugin, view: PulseView) {
		this.plugin = plugin;
		this.view = view;
	}

	private captureSegmentScroll(container: HTMLElement): void {
		const scrollEl = container.querySelector(".pulse-sidebar__segment-scroll");
		if (scrollEl instanceof HTMLElement) {
			this.savedSegmentScrollTop = scrollEl.scrollTop;
		}
	}

	private restoreSegmentScroll(scrollArea: HTMLElement): void {
		const top = this.savedSegmentScrollTop;
		if (top <= 0) return;
		requestAnimationFrame(() => {
			const scrollEl = scrollArea.querySelector(".pulse-sidebar__segment-scroll");
			if (scrollEl instanceof HTMLElement) {
				scrollEl.scrollTop = top;
			}
		});
	}

	async render(container: HTMLElement, mode: PulseViewMode = this.view.mode): Promise<void> {
		this.captureSegmentScroll(container);
		this.container = container;
		container.empty();

		if (mode === "nutrition") {
			await this.renderNutritionSidebar(container);
			return;
		}

		const panel = container.createDiv({ cls: "pulse-sidebar-panel" });
		const dm = this.plugin.workoutDataManager;

		const segment = getSidebarSegment();

		const segWrap = panel.createDiv({ cls: "pulse-sidebar__segment-wrap" });
		const seg = segWrap.createDiv({
			cls: "pulse-sidebar__segment",
			attr: { role: "tablist", "aria-label": "Sidebar list" },
		});

		const mkSegBtn = (id: PulseSidebarSegment, label: string) => {
			const btn = seg.createEl("button", {
				type: "button",
				cls: `pulse-sidebar__segment-btn ${segment === id ? "pulse-sidebar__segment-btn--active" : ""}`,
				text: label,
				attr: { role: "tab", "aria-selected": segment === id ? "true" : "false" },
			});
			btn.addEventListener("click", async () => {
				if (getSidebarSegment() === id) return;
				setSidebarSegment(id);
				if (this.container) await this.render(this.container);
			});
			return btn;
		};
		mkSegBtn("workouts", "Workouts");
		mkSegBtn("exercises", "Exercises");

		const scrollArea = panel.createDiv({ cls: "pulse-sidebar__segment-scroll" });

		if (segment === "workouts") {
			const entries = dm.getAllWorkoutListEntries();
			const loading = scrollArea.createDiv({
				text: "Loading workouts…",
				cls: "pulse-sidebar__empty",
			});
			void dm.enrichWorkoutListEntries(entries).then((enriched) => {
				loading.remove();
				this.renderWorkoutsList(scrollArea, enriched);
				this.restoreSegmentScroll(scrollArea);
			});
		} else {
			const exercises = await dm.getAllExercises();
			this.renderExercisesList(scrollArea, exercises);
			this.restoreSegmentScroll(scrollArea);
		}
	}

	private renderWorkoutsList(parent: HTMLElement, entries: WorkoutListEntry[]): void {
		const activePath =
			this.view.mode === "session" || this.view.mode === "workout-edit"
				? this.view.activePath
				: null;
		renderWorkoutSidebarList(parent, entries, {
			weightUnit: this.plugin.settings.weightUnit,
			activePath,
			allEntries: entries,
			onSelect: (path) => this.view.navigate("session", path, true),
			onMerge: (source, targets) => this.openMergeModal(source, targets),
			onUpdateBanner: (entry) => void this.updateBannerForEntry(entry),
			onDelete: (entry) => this.confirmDeleteWorkout(entry),
			getIconUrl: (iconName) => this.plugin.importManager.getActivityIconUrl(iconName),
		});
	}

	private confirmDeleteWorkout(entry: WorkoutListEntry): void {
		new WorkoutDeleteConfirmModal(
			this.plugin.app,
			entry.displayName,
			async () => {
				await this.plugin.workoutDataManager.deleteSession(entry.path);
				new Notice("Workout moved to trash.");
				if (this.view.activePath === entry.path) {
					this.view.navigate("today");
				}
				await this.view.refresh();
			},
		).open();
	}

	private async updateBannerForEntry(entry: WorkoutListEntry): Promise<void> {
		await this.plugin.importManager.updateBannerForNoteWithNotice(entry.file);
		if (this.view.activePath === entry.path) {
			await this.view.refresh();
		}
	}

	private openMergeModal(source: WorkoutListEntry, targets: WorkoutListEntry[]): void {
		new WorkoutMergeModal(
			this.plugin.app,
			source,
			targets,
			this.plugin.settings.weightUnit,
			async (target) => {
				try {
					await this.plugin.importManager.mergeWorkoutIntoTarget(target.file, source.file);
					new Notice(`Merged into “${target.displayName}”.`);
					if (this.view.activePath === source.path) {
						this.view.navigate("session", target.path);
					}
					await this.view.refresh();
				} catch (e) {
					console.error(e);
					new Notice("Could not merge workouts.");
				}
			},
		).open();
	}

	private renderExercisesList(parent: HTMLElement, exercises: ExerciseNote[]): void {
		const toolbar = parent.createDiv({ cls: "pulse-sidebar__ex-toolbar" });
		const groupWrap = toolbar.createDiv({ cls: "pulse-sidebar__group-by-wrap" });
		groupWrap.createSpan({ text: "Group", cls: "pulse-sidebar__group-by-label" });
		const groupSelect = groupWrap.createEl("select", { cls: "pulse-sidebar__group-by" });
		for (const o of [
			{ value: "movement", label: "Movement" },
			{ value: "body_part", label: "Body part" },
		] as { value: ExerciseGroupBy; label: string }[]) {
			groupSelect.createEl("option", { text: o.label, value: o.value });
		}
		const storedGroup = getStoredExerciseGroupBy();
		groupSelect.value = storedGroup === "body_part" ? "body_part" : "movement";

		const searchWrap = parent.createDiv({ cls: "pulse-sidebar__search-wrap" });
		const listId = "pulse-sidebar-exercise-name-hints";
		const dataList = searchWrap.createEl("datalist", { attr: { id: listId } });
		const seen = new Set<string>();
		for (const e of exercises) {
			const n = e.frontmatter.name.trim();
			if (n && !seen.has(n)) {
				seen.add(n);
				dataList.createEl("option", { attr: { value: n } });
			}
		}

		const searchInput = searchWrap.createEl("input", {
			type: "search",
			cls: "pulse-sidebar__search",
			placeholder: "Filter exercises…",
			attr: { list: listId, autocomplete: "off" },
		});

		const listContainer = parent.createDiv({ cls: "pulse-sidebar__exercise-container" });

		const renderExerciseRow = (list: HTMLElement, ex: ExerciseNote): void => {
			const li = list.createEl("li");
			const row = li.createDiv({
				cls: `pulse-sidebar__row ${
					this.view.mode === "exercise" && this.view.activePath === ex.file.path
						? "pulse-sidebar__row--active"
						: ""
				}`,
			});
			row.setAttribute("role", "button");
			row.setAttribute("tabindex", "0");

			const inner = row.createDiv({ cls: "pulse-sidebar__row-inner" });
			inner.createSpan({ text: ex.frontmatter.name, cls: "pulse-sidebar__row-name" });

			const details: string[] = [];
			if (ex.frontmatter.body_part) details.push(ex.frontmatter.body_part);
			if (ex.frontmatter.equipment) details.push(ex.frontmatter.equipment);
			if (ex.frontmatter["pr-weight"]) {
				details.push(`PR: ${ex.frontmatter["pr-weight"]} ${ex.frontmatter.unit}`);
			}
			if (details.length > 0) {
				inner.createSpan({ text: details.join(" · "), cls: "pulse-sidebar__row-meta" });
			}

			const path = ex.file.path;
			row.addEventListener("click", () => this.view.navigate("exercise", path, true));
			row.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					this.view.navigate("exercise", path, true);
				}
			});
		};

		const renderList = (filter: string) => {
			listContainer.empty();
			const groupBy = groupSelect.value as ExerciseGroupBy;
			const filtered = exercises
				.filter((e) => exerciseMatchesFilter(e, filter))
				.sort((a, b) => a.frontmatter.name.localeCompare(b.frontmatter.name));

			if (filtered.length === 0) {
				listContainer.createDiv({
					text: filter.trim() ? "No matches" : "No exercises yet",
					cls: "pulse-sidebar__empty",
				});
				return;
			}

			const grouped = groupExercisesBy(filtered, groupBy);
			const keys = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
			const groupsWrap = listContainer.createDiv({ cls: "pulse-workout-groups" });

			for (const key of keys) {
				const exList = grouped.get(key)!;
				const groupEl = groupsWrap.createDiv({ cls: "pulse-sidebar__group" });
				const header = groupEl.createDiv({ cls: "pulse-sidebar__group-header" });
				header.createDiv({ cls: "pulse-sidebar__group-title", text: key });

				const list = groupEl.createEl("ul", { cls: "pulse-sidebar__list" });
				for (const ex of exList) {
					renderExerciseRow(list, ex);
				}
			}
		};

		groupSelect.addEventListener("change", () => {
			setStoredExerciseGroupBy(groupSelect.value as ExerciseGroupBy);
			renderList(searchInput.value);
		});

		renderList("");
		searchInput.addEventListener("input", () => renderList(searchInput.value));
	}

	private async renderNutritionSidebar(parent: HTMLElement): Promise<void> {
		const panel = parent.createDiv({ cls: "pulse-sidebar-panel" });
		panel.createEl("h3", { text: "Logged days", cls: "pulse-sidebar__section-title" });

		const { year, month } = getStoredNutritionMonth();
		const meals = await this.plugin.nutritionDataManager.loadMonthEntries(year, month);
		const byDate = groupMealsByDate(meals);
		const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

		if (dates.length === 0) {
			panel.createDiv({
				text: "No food logs this month. Add list items with meal:: fields to your monthly nutrition note.",
				cls: "pulse-sidebar__empty",
			});
			return;
		}

		const list = panel.createEl("ul", { cls: "pulse-sidebar__list" });
		for (const date of dates) {
			const dayMeals = byDate.get(date)!;
			const totals = dayMeals.reduce(
				(acc, m) => {
					acc.calories += m.calories;
					acc.meals += 1;
					return acc;
				},
				{ calories: 0, meals: 0 }
			);

			const li = list.createEl("li");
			const row = li.createDiv({ cls: "pulse-sidebar__row" });
			row.setAttribute("role", "button");
			row.setAttribute("tabindex", "0");

			const inner = row.createDiv({ cls: "pulse-sidebar__row-inner" });
			inner.createSpan({ text: date, cls: "pulse-sidebar__row-name" });
			inner.createSpan({
				text: `${Math.round(totals.calories)} cal · ${totals.meals} meal${totals.meals === 1 ? "" : "s"}`,
				cls: "pulse-sidebar__row-meta",
			});

			const open = () => void this.plugin.openNutritionDayView(date);
			row.addEventListener("click", open);
			row.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					open();
				}
			});
		}
	}
}
