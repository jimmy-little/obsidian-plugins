import { setIcon } from "obsidian";
import type PulsePlugin from "../main";
import type { PulseView } from "./PulseView";
import type { ProgramNote, ExerciseNote, SessionNote } from "../workout/types";
import { isStandaloneSession } from "../workout/types";

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

		// ── Programs section ──
		this.renderProgramsSection(panel, programs);

		// ── Standalone workouts (not part of a program) ──
		this.renderWorkoutsSection(panel, standaloneWorkouts);

		// ── Exercises section ──
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
			const li = list.createEl("li");
			const dayName = w.frontmatter.programDay ?? "Workout";
			const row = li.createDiv({
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
				text: `${w.frontmatter.date} — ${dayName}`,
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
		}
	}

	private renderProgramsSection(parent: HTMLElement, programs: ProgramNote[]): void {
		const section = parent.createDiv({ cls: "pulse-sidebar__section" });

		const header = section.createDiv({ cls: "pulse-sidebar__section-head" });
		header.createSpan({ text: "Programs", cls: "pulse-sidebar__section-title" });

		const addProgramBtn = header.createDiv({ cls: "pulse-pm__glyph-btn clickable-icon pulse-sidebar__section-action" });
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

		for (const program of programs) {
			const li = list.createEl("li");
			const programRow = li.createDiv({
				cls: `pulse-sidebar__row pulse-sidebar__row--group ${
					this.view.mode === "program" && this.view.activePath === program.file.path
						? "pulse-sidebar__row--active" : ""
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

			programRow.addEventListener("click", () => {
				this.view.navigate("program", program.file.path);
			});
			programRow.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					this.view.navigate("program", program.file.path);
				}
			});

			// Nested day list
			const dayList = li.createEl("ul", { cls: "pulse-sidebar__day-list" });
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

		const addBtn = header.createDiv({ cls: "pulse-pm__glyph-btn clickable-icon pulse-sidebar__section-action" });
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

		// Search
		const searchWrap = section.createDiv({ cls: "pulse-sidebar__search-wrap" });
		const searchInput = searchWrap.createEl("input", {
			type: "text",
			cls: "pulse-sidebar__search",
			placeholder: "Filter exercises...",
		});

		const listContainer = section.createDiv({ cls: "pulse-sidebar__exercise-container" });

		const renderList = (filter: string) => {
			listContainer.empty();

			const filtered = exercises.filter(e =>
				e.frontmatter.name.toLowerCase().includes(filter.toLowerCase()) ||
				e.frontmatter.movement.toLowerCase().includes(filter.toLowerCase())
			);

			// Group by movement
			const grouped = new Map<string, ExerciseNote[]>();
			for (const ex of filtered) {
				const mov = ex.frontmatter.movement || "Uncategorized";
				if (!grouped.has(mov)) grouped.set(mov, []);
				grouped.get(mov)!.push(ex);
			}

			if (grouped.size === 0) {
				listContainer.createDiv({
					text: "No matches",
					cls: "pulse-sidebar__empty",
				});
				return;
			}

			for (const [movement, exList] of grouped) {
				const group = listContainer.createDiv({ cls: "pulse-sidebar__group" });
				group.createDiv({ text: movement, cls: "pulse-sidebar__group-title" });

				const list = group.createEl("ul", { cls: "pulse-sidebar__list" });
				for (const ex of exList) {
					const li = list.createEl("li");
					const row = li.createDiv({
						cls: `pulse-sidebar__row ${
							this.view.mode === "exercise" && this.view.activePath === ex.file.path
								? "pulse-sidebar__row--active" : ""
						}`,
					});
					row.setAttribute("role", "button");
					row.setAttribute("tabindex", "0");

					const inner = row.createDiv({ cls: "pulse-sidebar__row-inner" });
					inner.createSpan({ text: ex.frontmatter.name, cls: "pulse-sidebar__row-name" });

					const details: string[] = [];
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
		searchInput.addEventListener("input", (e) => renderList((e.target as HTMLInputElement).value));
	}
}
