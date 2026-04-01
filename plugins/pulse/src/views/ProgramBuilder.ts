import { Notice, setIcon } from "obsidian";
import type PulsePlugin from "../main";
import type { PulseView } from "./PulseView";
import type { ProgramDay, ProgramNote } from "../workout/types";
import { WorkoutBuilder } from "./WorkoutBuilder";

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export class ProgramBuilder {
	private plugin: PulsePlugin;
	private view: PulseView;
	private container: HTMLElement | null = null;

	private programName = "";
	private schedule: Set<string> = new Set();
	private rotation: "sequential" | "weekday-mapped" = "sequential";
	private active = true;
	private days: ProgramDay[] = [];
	private editingPath: string | null = null;

	constructor(plugin: PulsePlugin, view: PulseView) {
		this.plugin = plugin;
		this.view = view;
	}

	async render(container: HTMLElement, editPath?: string): Promise<void> {
		this.container = container;

		if (editPath) {
			await this.loadExisting(editPath);
		}

		this.renderUI();
	}

	private async loadExisting(path: string): Promise<void> {
		const programs = await this.plugin.workoutDataManager.getAllPrograms();
		const program = programs.find(p => p.file.path === path);
		if (!program) return;

		this.editingPath = path;
		this.programName = program.name;
		this.schedule = new Set(program.schedule);
		this.rotation = program.rotation;
		this.active = program.active;
		this.days = program.days.map(d => ({
			name: d.name,
			exercises: d.exercises.map(e => ({ ...e })),
		}));
	}

	private renderUI(): void {
		if (!this.container) return;
		this.container.empty();

		// ── Program name ──
		const nameSection = this.container.createDiv({ cls: "pulse-builder__section" });
		nameSection.createEl("label", { text: "Program Name", cls: "pulse-builder__field-label" });
		const nameInput = nameSection.createEl("input", {
			type: "text",
			cls: "pulse-builder__name-input",
			placeholder: "e.g. Push Pull Legs",
			value: this.programName,
		});
		nameInput.addEventListener("input", () => { this.programName = nameInput.value; });

		// ── Schedule ──
		const schedSection = this.container.createDiv({ cls: "pulse-builder__section" });
		schedSection.createEl("label", { text: "Training Days", cls: "pulse-builder__field-label" });
		const dayRow = schedSection.createDiv({ cls: "pulse-pgm__day-picker" });

		for (const day of ALL_DAYS) {
			const chip = dayRow.createDiv({
				cls: `pulse-pgm__day-chip ${this.schedule.has(day) ? "pulse-pgm__day-chip--active" : ""}`,
				text: day,
			});
			chip.addEventListener("click", () => {
				if (this.schedule.has(day)) {
					this.schedule.delete(day);
					chip.removeClass("pulse-pgm__day-chip--active");
				} else {
					this.schedule.add(day);
					chip.addClass("pulse-pgm__day-chip--active");
				}
			});
		}

		// ── Rotation ──
		const rotSection = this.container.createDiv({ cls: "pulse-builder__section" });
		rotSection.createEl("label", { text: "Rotation", cls: "pulse-builder__field-label" });
		const rotRow = rotSection.createDiv({ cls: "pulse-pgm__toggle-row" });

		const seqBtn = rotRow.createEl("button", {
			text: "Sequential",
			cls: `pulse-pgm__toggle-btn ${this.rotation === "sequential" ? "pulse-pgm__toggle-btn--active" : ""}`,
		});
		const wdBtn = rotRow.createEl("button", {
			text: "Weekday-mapped",
			cls: `pulse-pgm__toggle-btn ${this.rotation === "weekday-mapped" ? "pulse-pgm__toggle-btn--active" : ""}`,
		});

		seqBtn.addEventListener("click", () => {
			this.rotation = "sequential";
			seqBtn.addClass("pulse-pgm__toggle-btn--active");
			wdBtn.removeClass("pulse-pgm__toggle-btn--active");
		});
		wdBtn.addEventListener("click", () => {
			this.rotation = "weekday-mapped";
			wdBtn.addClass("pulse-pgm__toggle-btn--active");
			seqBtn.removeClass("pulse-pgm__toggle-btn--active");
		});

		// ── Active toggle ──
		const activeSection = this.container.createDiv({ cls: "pulse-builder__section pulse-builder__section--row" });
		activeSection.createEl("label", { text: "Set as active program", cls: "pulse-builder__field-label" });
		const toggle = activeSection.createEl("input", { type: "checkbox" });
		toggle.checked = this.active;
		toggle.addEventListener("change", () => { this.active = toggle.checked; });

		// ── Workout days ──
		const daysSection = this.container.createDiv({ cls: "pulse-builder__section" });
		daysSection.createEl("label", { text: "Workout Days", cls: "pulse-builder__field-label" });

		const daysList = daysSection.createDiv({ cls: "pulse-pgm__days-list" });

		for (let i = 0; i < this.days.length; i++) {
			this.renderDayCard(daysList, i);
		}

		const addDayBtn = daysSection.createEl("button", {
			text: "+ Add Workout Day",
			cls: "pulse-workout-btn pulse-workout-btn-secondary pulse-builder__add-btn",
		});
		addDayBtn.addEventListener("click", () => this.addNewDay());

		// ── Bottom actions ──
		const actions = this.container.createDiv({ cls: "pulse-builder__actions" });

		const cancelBtn = actions.createEl("button", {
			text: "Cancel",
			cls: "pulse-workout-btn pulse-workout-btn-secondary",
		});
		cancelBtn.addEventListener("click", () => {
			if (this.editingPath) {
				this.view.navigate("program", this.editingPath);
			} else {
				this.view.navigate("today");
			}
		});

		const saveBtn = actions.createEl("button", {
			text: this.editingPath ? "Update Program" : "Create Program",
			cls: "pulse-workout-btn pulse-workout-btn-primary",
		});
		saveBtn.addEventListener("click", () => this.handleSave());
	}

	private renderDayCard(parent: HTMLElement, idx: number): void {
		const day = this.days[idx];
		const card = parent.createDiv({ cls: "pulse-pgm__day-card" });

		const header = card.createDiv({ cls: "pulse-pgm__day-card-head" });

		const orderControls = header.createDiv({ cls: "pulse-builder__order" });
		if (idx > 0) {
			const upBtn = orderControls.createEl("button", { cls: "pulse-builder__order-btn clickable-icon" });
			setIcon(upBtn, "chevron-up");
			upBtn.addEventListener("click", () => { this.moveDay(idx, -1); });
		}
		if (idx < this.days.length - 1) {
			const downBtn = orderControls.createEl("button", { cls: "pulse-builder__order-btn clickable-icon" });
			setIcon(downBtn, "chevron-down");
			downBtn.addEventListener("click", () => { this.moveDay(idx, 1); });
		}

		const nameArea = header.createDiv({ cls: "pulse-pgm__day-card-name" });
		nameArea.createSpan({ text: day.name, cls: "pulse-builder__card-name" });
		nameArea.createSpan({
			text: `${day.exercises.length} exercise${day.exercises.length !== 1 ? "s" : ""}`,
			cls: "pulse-builder__card-meta",
		});

		const headerActions = header.createDiv({ cls: "pulse-pgm__day-card-actions" });

		const editBtn = headerActions.createEl("button", { cls: "pulse-builder__order-btn clickable-icon" });
		setIcon(editBtn, "pencil");
		editBtn.setAttribute("aria-label", "Edit workout");
		editBtn.addEventListener("click", () => this.editDay(idx));

		const removeBtn = headerActions.createEl("button", { cls: "pulse-builder__remove-btn clickable-icon" });
		setIcon(removeBtn, "x");
		removeBtn.addEventListener("click", () => {
			this.days.splice(idx, 1);
			this.renderUI();
		});

		// Exercise summary list
		if (day.exercises.length > 0) {
			const exList = card.createDiv({ cls: "pulse-pgm__day-exercises" });
			for (const ex of day.exercises) {
				const exName = ex.exercisePath.split("/").pop()?.replace(".md", "") ?? ex.exercisePath;
				const detail = ex.reps ? `${ex.sets} × ${ex.reps}` : ex.duration ? `${ex.sets} × ${ex.duration}s` : `${ex.sets} sets`;
				const row = exList.createDiv({ cls: "pulse-pgm__day-exercise-row" });
				row.createSpan({ text: exName });
				row.createSpan({ text: detail, cls: "pulse-workout-muted" });
			}
		}
	}

	private addNewDay(): void {
		if (!this.container) return;
		this.container.empty();

		const header = this.container.createDiv({ cls: "pulse-pm__main-head" });
		header.createEl("h2", { text: "New Workout Day", cls: "pulse-pm__main-title" });

		const body = this.container.createDiv({ cls: "pulse-pm__main-body" });
		const builder = new WorkoutBuilder(this.plugin, this.view);
		builder.render(body, {
			onSave: (day) => {
				this.days.push(day);
				this.renderUI();
			},
		});
	}

	private editDay(idx: number): void {
		if (!this.container) return;
		this.container.empty();

		const header = this.container.createDiv({ cls: "pulse-pm__main-head" });
		header.createEl("h2", { text: `Edit: ${this.days[idx].name}`, cls: "pulse-pm__main-title" });

		const body = this.container.createDiv({ cls: "pulse-pm__main-body" });
		const builder = new WorkoutBuilder(this.plugin, this.view);
		builder.render(body, {
			editDay: this.days[idx],
			onSave: (day) => {
				this.days[idx] = day;
				this.renderUI();
			},
		});
	}

	private moveDay(idx: number, direction: number): void {
		const target = idx + direction;
		if (target < 0 || target >= this.days.length) return;
		const tmp = this.days[idx];
		this.days[idx] = this.days[target];
		this.days[target] = tmp;
		this.renderUI();
	}

	private async handleSave(): Promise<void> {
		const name = this.programName.trim();
		if (!name) {
			new Notice("Enter a program name");
			return;
		}
		if (this.days.length === 0) {
			new Notice("Add at least one workout day");
			return;
		}

		const dm = this.plugin.workoutDataManager;
		try {
			if (this.editingPath) {
				await dm.saveProgram(this.editingPath, {
					name,
					schedule: Array.from(this.schedule),
					rotation: this.rotation,
					active: this.active,
					days: this.days,
				});
				new Notice(`Updated ${name}`);
				this.view.navigate("program", this.editingPath);
			} else {
				const file = await dm.createProgram({
					name,
					schedule: Array.from(this.schedule),
					rotation: this.rotation,
					active: this.active,
					days: this.days,
				});
				new Notice(`Created ${name}`);
				this.view.navigate("program", file.path);
			}
		} catch (e) {
			new Notice(`Failed to save program: ${e instanceof Error ? e.message : e}`);
		}
	}
}
