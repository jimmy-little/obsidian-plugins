import { setIcon } from "obsidian";
import type PulsePlugin from "../main";
import type { PulseView } from "./PulseView";
import type { ProgramNote, ExerciseNote, SessionNote } from "../workout/types";
import { isStandaloneSession } from "../workout/types";
import {
	type ExerciseGroupBy,
	exerciseMatchesFilter,
	getStoredExerciseGroupBy,
	groupExercisesBy,
	setStoredExerciseGroupBy,
} from "../workout/exerciseListUi";

const COLLAPSED_PROGRAMS_KEY = "pulse-sidebar-programs-collapsed";

function loadCollapsedProgramPaths(): Set<string> {
	try {
		const raw = localStorage.getItem(COLLAPSED_PROGRAMS_KEY);
		const arr = raw ? (JSON.parse(raw) as string[]) : [];
		return new Set(arr.filter(Boolean));
	} catch {
		return new Set();
	}
}

function saveCollapsedProgramPaths(paths: Set<string>): void {
	try {
		localStorage.setItem(COLLAPSED_PROGRAMS_KEY, JSON.stringify([...paths]));
	} catch { /* ignore */ }
}

export class PulseSidebar {
	private plugin: PulsePlugin;
	private view: PulseView;
	private container: HTMLElement | null = null;

	constructor(plugin: PulsePlugin, view: PulseView) {
		this.plugin = plugin;
		this.view = view;
	}

	async render(container: HTMLElement): Promise<void> {
		this.container = container;
		container.empty();

		const panel = container.createDiv({ cls: "pulse-sidebar-panel" });

		const dm = this.plugin.workoutDataManager;
		const [programs, exercises, allSessions] = await Promise.all([
			dm.getAllPrograms(),
			dm.getAllExercises(),
			dm.getAllSessions(),
		]);

		const standaloneWorkouts = allSessions.filter(isStandaloneSession);

		this.renderProgramsSection(panel, programs);
		this.renderWorkoutsSection(panel, standaloneWorkouts);
		this.renderExercisesSection(panel, exercises);
	}

	private renderWorkoutsSection(parent: HTMLElement, workouts: SessionNote[]): void {
		const section = parent.createDiv({ cls: "pulse-sidebar__section" });

		const header = section.createDiv({ cls: "pulse-sidebar__section-head" });
		header.createSpan({ text: "Workouts", cls: "pulse-sidebar__section-title" });

		if (workouts.length === 0) {
			section.createDiv({
				text: "No standalone workouts yet",
				cls: "pulse-sidebar__empty",
			});
			return;
		}

		const list = section.createEl("ul", { cls: "pulse-sidebar__list" });

		for (const w of workouts) {
			const li = list.createEl("li", { cls: "pulse-sidebar__workout-item" });
			const wrap = li.createDiv({ cls: "pulse-sidebar__row-with-actions" });

			const row = wrap.createDiv({
				cls: `pulse-sidebar__row ${
					this.view.mode === "workout-edit" && this.view.activePath === w.file.path
						? "pulse-sidebar__row--active"
						: ""
				}`,
			});
			row.setAttribute("role", "button");
			row.setAttribute("tabindex", "0");

			const inner = row.createDiv({ cls: "pulse-sidebar__row-inner" });
			inner.createSpan({
				text: `${w.frontmatter.date} — ${w.frontmatter.programDay ?? "Workout"}`,
				cls: "pulse-sidebar__row-name",
			});
			inner.createSpan({
				text: w.file.basename,
				cls: "pulse-sidebar__row-meta",
			});

			const go = () => this.view.navigate("workout-edit", w.file.path);
			row.addEventListener("click", go);
			row.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					go();
				}
			});

			const delBtn = wrap.createEl("button", {
				cls: "pulse-sidebar__icon-btn clickable-icon",
				attr: { type: "button", "aria-label": "Delete workout" },
			});
			setIcon(delBtn, "trash-2");
			delBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				if (
					!window.confirm(
						"Delete this workout? The note will be moved to Trash.",
					)
				) {
					return;
				}
				await this.plugin.workoutDataManager.deleteSession(w.file.path);
				if (
					this.view.mode === "workout-edit" &&
					this.view.activePath === w.file.path
				) {
					this.view.navigate("today");
				} else {
					await this.view.refresh();
				}
			});
		}
	}

	private renderProgramsSection(parent: HTMLElement, programs: ProgramNote[]): void {
		const section = parent.createDiv({ cls: "pulse-sidebar__section" });

		const header = section.createDiv({ cls: "pulse-sidebar__section-head" });
		header.createSpan({ text: "Programs", cls: "pulse-sidebar__section-title" });

		const addProgramBtn = header.createDiv({
			cls: "pulse-pm__glyph-btn clickable-icon pulse-sidebar__section-action",
		});
		setIcon(addProgramBtn, "plus");
		addProgramBtn.setAttribute("aria-label", "New program");
		addProgramBtn.addEventListener("click", () => this.view.navigate("program-builder"));

		if (programs.length === 0) {
			section.createDiv({
				text: "No programs yet",
				cls: "pulse-sidebar__empty",
			});
			return;
		}

		const list = section.createEl("ul", { cls: "pulse-sidebar__list" });
		const collapsedSet = loadCollapsedProgramPaths();

		for (const program of programs) {
			const li = list.createEl("li", { cls: "pulse-sidebar__program-item" });
			const collapsed = collapsedSet.has(program.file.path);

			const headWrap = li.createDiv({ cls: "pulse-sidebar__program-head" });

			const collapseBtn = headWrap.createEl("button", {
				cls: "pulse-sidebar__collapse-btn pulse-pm__glyph-btn clickable-icon",
				attr: { type: "button" },
			});
			setIcon(collapseBtn, collapsed ? "chevron-right" : "chevron-down");
			collapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
			collapseBtn.setAttribute("aria-label", collapsed ? "Expand days" : "Collapse days");
			collapseBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				const next = loadCollapsedProgramPaths();
				if (next.has(program.file.path)) next.delete(program.file.path);
				else next.add(program.file.path);
				saveCollapsedProgramPaths(next);
				if (this.container) await this.render(this.container);
			});

			const programRow = headWrap.createDiv({
				cls: `pulse-sidebar__row pulse-sidebar__row--group ${
					this.view.mode === "program" && this.view.activePath === program.file.path
						? "pulse-sidebar__row--active"
						: ""
				}`,
			});
			programRow.setAttribute("role", "button");
			programRow.setAttribute("tabindex", "0");

			const inner = programRow.createDiv({ cls: "pulse-sidebar__row-inner" });
			const head = inner.createDiv({ cls: "pulse-sidebar__row-head" });
			head.createSpan({ text: program.name, cls: "pulse-sidebar__row-name" });
			if (program.active) {
				head.createSpan({ text: "Active", cls: "pulse-sidebar__badge" });
			}

			const meta = inner.createDiv({ cls: "pulse-sidebar__row-meta" });
			meta.createSpan({ text: `${program.days.length} days` });
			meta.createSpan({ text: " · ", cls: "pulse-sidebar__meta-sep" });
			meta.createSpan({ text: program.schedule.join(", ") });

			const nav = () => this.view.navigate("program", program.file.path);
			programRow.addEventListener("click", nav);
			programRow.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					nav();
				}
			});

			const dayList = li.createEl("ul", { cls: "pulse-sidebar__day-list" });
			if (collapsed) dayList.style.display = "none";

			for (const day of program.days) {
				const dayLi = dayList.createEl("li");
				const dayRow = dayLi.createDiv({ cls: "pulse-sidebar__row pulse-sidebar__row--day" });
				dayRow.setAttribute("role", "button");
				dayRow.setAttribute("tabindex", "0");

				const dayInner = dayRow.createDiv({ cls: "pulse-sidebar__row-inner" });
				dayInner.createSpan({ text: day.name, cls: "pulse-sidebar__row-name pulse-sidebar__row-name--day" });
				dayInner.createSpan({
					text: `${day.exercises.length} exercises`,
					cls: "pulse-sidebar__row-meta",
				});

				dayRow.addEventListener("click", () => {
					this.view.navigate("program", program.file.path);
				});
			}
		}
	}

	private renderExercisesSection(parent: HTMLElement, exercises: ExerciseNote[]): void {
		const section = parent.createDiv({ cls: "pulse-sidebar__section" });

		const header = section.createDiv({ cls: "pulse-sidebar__section-head" });
		header.createSpan({ text: "Exercises", cls: "pulse-sidebar__section-title" });

		const addBtn = header.createDiv({
			cls: "pulse-pm__glyph-btn clickable-icon pulse-sidebar__section-action",
		});
		setIcon(addBtn, "plus");
		addBtn.setAttribute("aria-label", "New exercise");
		addBtn.addEventListener("click", () => this.view.navigate("new-exercise"));

		if (exercises.length === 0) {
			section.createDiv({
				text: "No exercises yet",
				cls: "pulse-sidebar__empty",
			});
			return;
		}

		const toolbar = section.createDiv({ cls: "pulse-sidebar__ex-toolbar" });
		const groupWrap = toolbar.createDiv({ cls: "pulse-sidebar__group-by-wrap" });
		groupWrap.createEl("label", {
			text: "Group",
			cls: "pulse-sidebar__group-by-label",
			attr: { for: "pulse-sidebar-ex-group" },
		});
		const groupSelect = groupWrap.createEl("select", {
			cls: "pulse-sidebar__group-by",
			attr: { id: "pulse-sidebar-ex-group" },
		});
		const groupOptions: { value: ExerciseGroupBy; label: string }[] = [
			{ value: "movement", label: "Movement" },
			{ value: "equipment", label: "Equipment" },
			{ value: "body_part", label: "Body part" },
		];
		for (const o of groupOptions) {
			groupSelect.createEl("option", { text: o.label, value: o.value });
		}
		groupSelect.value = getStoredExerciseGroupBy();
		groupSelect.addEventListener("change", () => {
			setStoredExerciseGroupBy(groupSelect.value as ExerciseGroupBy);
			renderList(searchInput.value);
		});

		const searchWrap = section.createDiv({ cls: "pulse-sidebar__search-wrap" });
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
			placeholder: "Find exercises (names, tags, equipment…)",
			attr: { list: listId, autocomplete: "off" },
		});

		const listContainer = section.createDiv({ cls: "pulse-sidebar__exercise-container" });

		const renderList = (filter: string) => {
			listContainer.empty();
			const by = getStoredExerciseGroupBy();
			groupSelect.value = by;

			const filtered = exercises.filter(e => exerciseMatchesFilter(e, filter));
			const grouped = groupExercisesBy(filtered, by);

			if (grouped.size === 0) {
				listContainer.createDiv({
					text: "No matches",
					cls: "pulse-sidebar__empty",
				});
				return;
			}

			const keys = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
			for (const key of keys) {
				const exList = grouped.get(key)!;
				exList.sort((a, b) =>
					a.frontmatter.name.localeCompare(b.frontmatter.name),
				);

				const group = listContainer.createDiv({ cls: "pulse-sidebar__group" });
				group.createDiv({ text: key, cls: "pulse-sidebar__group-title" });

				const list = group.createEl("ul", { cls: "pulse-sidebar__list" });
				for (const ex of exList) {
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

					row.addEventListener("click", () => {
						this.view.navigate("exercise", ex.file.path);
					});
					row.addEventListener("keydown", (e: KeyboardEvent) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							this.view.navigate("exercise", ex.file.path);
						}
					});
				}
			}
		};

		renderList("");
		searchInput.addEventListener("input", () => renderList(searchInput.value));
	}
}
