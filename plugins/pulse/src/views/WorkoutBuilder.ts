import { Notice, setIcon } from "obsidian";
import type PulsePlugin from "../main";
import type { PulseView } from "./PulseView";
import type { ExerciseNote, ProgramExercise, ProgramDay } from "../workout/types";
import { exerciseMatchesFilter } from "../workout/exerciseListUi";

interface BuilderExercise {
	exercisePath: string;
	name: string;
	movement: string;
	equipment: string;
	sets: number;
	reps: number | undefined;
	duration: number | undefined;
}

export class WorkoutBuilder {
	private plugin: PulsePlugin;
	private view: PulseView;
	private container: HTMLElement | null = null;
	private exercises: BuilderExercise[] = [];
	private workoutName = "";
	private allExercises: ExerciseNote[] = [];

	private onSave: ((day: ProgramDay) => void) | null = null;
	private editingDay: ProgramDay | null = null;

	constructor(plugin: PulsePlugin, view: PulseView) {
		this.plugin = plugin;
		this.view = view;
	}

	async render(
		container: HTMLElement,
		opts?: { editDay?: ProgramDay; onSave?: (day: ProgramDay) => void },
	): Promise<void> {
		this.container = container;
		this.allExercises = await this.plugin.workoutDataManager.getAllExercises();

		if (opts?.editDay) {
			this.editingDay = opts.editDay;
			this.workoutName = opts.editDay.name;
			this.exercises = opts.editDay.exercises.map(e => {
				const note = this.allExercises.find(n => n.file.path === e.exercisePath);
				return {
					exercisePath: e.exercisePath,
					name: note?.frontmatter.name ?? e.exercisePath.split("/").pop()?.replace(".md", "") ?? "Exercise",
					movement: note?.frontmatter.movement ?? "",
					equipment: note?.frontmatter.equipment ?? "",
					sets: e.sets,
					reps: e.reps,
					duration: e.duration,
				};
			});
		}
		if (opts?.onSave) this.onSave = opts.onSave;

		this.renderUI();
	}

	private renderUI(): void {
		if (!this.container) return;
		this.container.empty();

		// ── Workout name input ──
		const nameRow = this.container.createDiv({ cls: "pulse-builder__name-row" });
		const nameInput = nameRow.createEl("input", {
			type: "text",
			cls: "pulse-builder__name-input",
			placeholder: "Workout name (e.g. Push Day A)",
			value: this.workoutName,
		});
		nameInput.addEventListener("input", () => {
			this.workoutName = nameInput.value;
		});

		// ── Exercise cards ──
		const listEl = this.container.createDiv({ cls: "pulse-builder__exercise-list" });

		if (this.exercises.length === 0) {
			const empty = listEl.createDiv({ cls: "pulse-builder__empty" });
			empty.createEl("p", { text: "No exercises added yet." });
			empty.createEl("p", { text: "Tap the button below to start building your workout.", cls: "pulse-workout-muted" });
		}

		for (let i = 0; i < this.exercises.length; i++) {
			this.renderExerciseCard(listEl, i);
		}

		// ── Add exercise button ──
		const addBtn = this.container.createEl("button", {
			text: "+ Add Exercise",
			cls: "pulse-workout-btn pulse-workout-btn-secondary pulse-builder__add-btn",
		});
		addBtn.addEventListener("click", () => this.showExercisePicker());

		// ── Bottom actions ──
		const actions = this.container.createDiv({ cls: "pulse-builder__actions" });

		const cancelBtn = actions.createEl("button", {
			text: "Cancel",
			cls: "pulse-workout-btn pulse-workout-btn-secondary",
		});
		cancelBtn.addEventListener("click", () => this.view.navigate("today"));

		const saveBtn = actions.createEl("button", {
			text: this.onSave ? "Save Workout" : "Start Workout",
			cls: "pulse-workout-btn pulse-workout-btn-primary",
		});
		saveBtn.addEventListener("click", () => this.handleSave());
	}

	private renderExerciseCard(parent: HTMLElement, idx: number): void {
		const ex = this.exercises[idx];
		const card = parent.createDiv({ cls: "pulse-builder__card" });

		// Header with drag handle area, name, and remove button
		const header = card.createDiv({ cls: "pulse-builder__card-head" });

		const orderControls = header.createDiv({ cls: "pulse-builder__order" });
		if (idx > 0) {
			const upBtn = orderControls.createEl("button", { cls: "pulse-builder__order-btn clickable-icon" });
			setIcon(upBtn, "chevron-up");
			upBtn.addEventListener("click", () => { this.moveExercise(idx, -1); });
		}
		if (idx < this.exercises.length - 1) {
			const downBtn = orderControls.createEl("button", { cls: "pulse-builder__order-btn clickable-icon" });
			setIcon(downBtn, "chevron-down");
			downBtn.addEventListener("click", () => { this.moveExercise(idx, 1); });
		}

		const nameArea = header.createDiv({ cls: "pulse-builder__card-name-area" });
		nameArea.createSpan({ text: ex.name, cls: "pulse-builder__card-name" });
		const badges: string[] = [];
		if (ex.movement) badges.push(ex.movement);
		if (ex.equipment) badges.push(ex.equipment);
		if (badges.length > 0) {
			nameArea.createSpan({ text: badges.join(" · "), cls: "pulse-builder__card-meta" });
		}

		const removeBtn = header.createEl("button", { cls: "pulse-builder__remove-btn clickable-icon" });
		setIcon(removeBtn, "x");
		removeBtn.addEventListener("click", () => {
			this.exercises.splice(idx, 1);
			this.renderUI();
		});

		// Sets/Reps controls — iPhone-style inline adjusters
		const controls = card.createDiv({ cls: "pulse-builder__controls" });

		// Sets
		const setsGroup = controls.createDiv({ cls: "pulse-builder__control-group" });
		setsGroup.createSpan({ text: "Sets", cls: "pulse-builder__control-label" });
		const setsControl = setsGroup.createDiv({ cls: "pulse-builder__stepper" });

		const setsMinus = setsControl.createEl("button", { text: "−", cls: "pulse-builder__stepper-btn" });
		const setsDisplay = setsControl.createSpan({ text: String(ex.sets), cls: "pulse-builder__stepper-value" });
		const setsPlus = setsControl.createEl("button", { text: "+", cls: "pulse-builder__stepper-btn" });

		setsMinus.addEventListener("click", () => {
			if (ex.sets > 1) { ex.sets--; setsDisplay.textContent = String(ex.sets); }
		});
		setsPlus.addEventListener("click", () => {
			ex.sets++; setsDisplay.textContent = String(ex.sets);
		});

		// Reps
		const repsGroup = controls.createDiv({ cls: "pulse-builder__control-group" });
		repsGroup.createSpan({ text: "Reps", cls: "pulse-builder__control-label" });
		const repsInput = repsGroup.createEl("input", {
			type: "text",
			cls: "pulse-builder__inline-input",
			value: ex.reps != null ? String(ex.reps) : "",
			placeholder: "—",
			attr: { inputmode: "numeric" },
		});
		repsInput.addEventListener("change", () => {
			const val = parseInt(repsInput.value, 10);
			ex.reps = isNaN(val) ? undefined : val;
		});

		// Duration (for timed exercises)
		const durGroup = controls.createDiv({ cls: "pulse-builder__control-group" });
		durGroup.createSpan({ text: "Seconds", cls: "pulse-builder__control-label" });
		const durInput = durGroup.createEl("input", {
			type: "text",
			cls: "pulse-builder__inline-input",
			value: ex.duration != null ? String(ex.duration) : "",
			placeholder: "—",
			attr: { inputmode: "numeric" },
		});
		durInput.addEventListener("change", () => {
			const val = parseInt(durInput.value, 10);
			ex.duration = isNaN(val) ? undefined : val;
		});
	}

	private showExercisePicker(): void {
		if (!this.container) return;

		const overlay = this.container.createDiv({ cls: "pulse-builder__overlay" });
		const picker = overlay.createDiv({ cls: "pulse-builder__picker" });

		const pickerHead = picker.createDiv({ cls: "pulse-builder__picker-head" });
		pickerHead.createEl("h3", { text: "Add Exercise" });
		const closeBtn = pickerHead.createEl("button", { cls: "pulse-builder__picker-close clickable-icon" });
		setIcon(closeBtn, "x");
		closeBtn.addEventListener("click", () => overlay.remove());

		const searchInput = picker.createEl("input", {
			type: "text",
			cls: "pulse-builder__picker-search",
			placeholder: "Search exercises...",
		});

		const listEl = picker.createDiv({ cls: "pulse-builder__picker-list" });

		const renderList = (filter: string) => {
			listEl.empty();
			const filtered = this.allExercises.filter(e => exerciseMatchesFilter(e, filter));

			// Group by movement
			const grouped = new Map<string, ExerciseNote[]>();
			for (const ex of filtered) {
				const mov = ex.frontmatter.movement || "Uncategorized";
				if (!grouped.has(mov)) grouped.set(mov, []);
				grouped.get(mov)!.push(ex);
			}

			if (grouped.size === 0) {
				listEl.createEl("p", { text: "No exercises found.", cls: "pulse-workout-muted" });
				return;
			}

			for (const [movement, exList] of grouped) {
				const group = listEl.createDiv({ cls: "pulse-builder__picker-group" });
				group.createDiv({ text: movement, cls: "pulse-builder__picker-group-title" });

				for (const ex of exList) {
					const already = this.exercises.some(e => e.exercisePath === ex.file.path);
					const row = group.createDiv({
						cls: `pulse-builder__picker-row ${already ? "pulse-builder__picker-row--added" : ""}`,
					});

					const info = row.createDiv({ cls: "pulse-builder__picker-row-info" });
					info.createSpan({ text: ex.frontmatter.name, cls: "pulse-builder__picker-row-name" });
					if (ex.frontmatter.equipment) {
						info.createSpan({ text: ex.frontmatter.equipment, cls: "pulse-builder__picker-row-meta" });
					}

					if (already) {
						row.createSpan({ text: "Added", cls: "pulse-builder__picker-row-badge" });
					} else {
						const addExBtn = row.createEl("button", {
							cls: "pulse-builder__picker-add clickable-icon",
						});
						setIcon(addExBtn, "plus");
						addExBtn.addEventListener("click", () => {
							this.exercises.push({
								exercisePath: ex.file.path,
								name: ex.frontmatter.name,
								movement: ex.frontmatter.movement,
								equipment: ex.frontmatter.equipment,
								sets: 3,
								reps: 10,
								duration: undefined,
							});
							renderList(searchInput.value);
						});
					}
				}
			}
		};

		renderList("");
		searchInput.addEventListener("input", () => renderList(searchInput.value));
		searchInput.focus();

		const doneBtn = picker.createEl("button", {
			text: `Done (${this.exercises.length} exercises)`,
			cls: "pulse-workout-btn pulse-workout-btn-primary pulse-builder__picker-done",
		});
		doneBtn.addEventListener("click", () => {
			overlay.remove();
			this.renderUI();
		});
	}

	private moveExercise(idx: number, direction: number): void {
		const target = idx + direction;
		if (target < 0 || target >= this.exercises.length) return;
		const tmp = this.exercises[idx];
		this.exercises[idx] = this.exercises[target];
		this.exercises[target] = tmp;
		this.renderUI();
	}

	private handleSave(): void {
		const name = this.workoutName.trim();
		if (!name) {
			new Notice("Enter a workout name");
			return;
		}
		if (this.exercises.length === 0) {
			new Notice("Add at least one exercise");
			return;
		}

		const day: ProgramDay = {
			name,
			exercises: this.exercises.map(e => ({
				exercisePath: e.exercisePath,
				sets: e.sets,
				reps: e.reps,
				duration: e.duration,
			})),
		};

		if (this.onSave) {
			this.onSave(day);
		} else {
			// No callback — start a workout directly from this template
			this.view.navigate("today");
		}
	}
}
