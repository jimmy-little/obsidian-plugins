import { Notice, setIcon } from "obsidian";
import type PulsePlugin from "../main";
import type { PulseView, PulseViewMode } from "./PulseView";
import { TodayTab } from "../workout/TodayTab";
import { HistoryTab } from "../workout/HistoryTab";
import { ExercisesTab } from "../workout/ExercisesTab";
import { StatsTab } from "../workout/StatsTab";
import { WorkoutBuilder } from "./WorkoutBuilder";
import { ProgramBuilder } from "./ProgramBuilder";
import type { ExerciseNote, ExerciseLogEntry, SetEntry, SessionNote, ProgramNote, SessionExercise } from "../workout/types";
import { isStandaloneSession } from "../workout/types";
import { renderProgressChart } from "../workout/charts";
import {
	estimate1RM, daysAgo, relativeDate, bestSet, totalVolumeForEntry,
	buildProgressSvg, buildActivityStrip,
} from "../workout/renderers";

export class PulseMainContent {
	private plugin: PulsePlugin;
	private view: PulseView;
	private container: HTMLElement | null = null;

	private todayTab: TodayTab | null = null;
	private historyTab: HistoryTab | null = null;
	private statsTab: StatsTab | null = null;
	private chart: { destroy(): void } | null = null;

	constructor(plugin: PulsePlugin, view: PulseView) {
		this.plugin = plugin;
		this.view = view;
	}

	async render(container: HTMLElement): Promise<void> {
		this.container = container;
		container.empty();

		switch (this.view.mode) {
			case "today":
				await this.renderToday(container);
				break;
			case "history":
				await this.renderHistory(container);
				break;
			case "stats":
				await this.renderStats(container);
				break;
			case "exercise":
				await this.renderExercise(container);
				break;
			case "session":
				await this.renderSession(container);
				break;
			case "workout-edit":
				await this.renderWorkoutEdit(container);
				break;
			case "program":
				await this.renderProgram(container);
				break;
			case "new-exercise":
				await this.renderNewExercise(container);
				break;
			case "workout-builder":
				await this.renderWorkoutBuilder(container);
				break;
			case "program-builder":
				await this.renderProgramBuilder(container);
				break;
			case "edit-program":
				await this.renderEditProgram(container);
				break;
			default:
				await this.renderToday(container);
		}
	}

	// ── Today ──

	private async renderToday(container: HTMLElement): Promise<void> {
		const header = container.createDiv({ cls: "pulse-pm__main-head" });
		header.createEl("h2", { text: "Today", cls: "pulse-pm__main-title" });

		const content = container.createDiv({ cls: "pulse-pm__main-body" });
		this.todayTab = new TodayTab(this.plugin, {});
		this.todayTab.render(content);
	}

	// ── History ──

	private async renderHistory(container: HTMLElement): Promise<void> {
		const header = container.createDiv({ cls: "pulse-pm__main-head" });
		header.createEl("h2", { text: "History", cls: "pulse-pm__main-title" });

		const content = container.createDiv({ cls: "pulse-pm__main-body" });
		this.historyTab = new HistoryTab(this.plugin);
		await this.historyTab.render(content);
	}

	// ── Stats ──

	private async renderStats(container: HTMLElement): Promise<void> {
		const header = container.createDiv({ cls: "pulse-pm__main-head" });
		header.createEl("h2", { text: "Stats", cls: "pulse-pm__main-title" });

		const content = container.createDiv({ cls: "pulse-pm__main-body" });
		this.statsTab = new StatsTab(this.plugin);
		await this.statsTab.render(content);
	}

	// ── Exercise detail ──

	private async renderExercise(container: HTMLElement): Promise<void> {
		const path = this.view.activePath;
		if (!path) {
			container.createEl("p", { text: "No exercise selected.", cls: "pulse-workout-muted" });
			return;
		}

		const dm = this.plugin.workoutDataManager;
		const exercise = await dm.getExercise(path);
		if (!exercise) {
			container.createEl("p", { text: "Exercise not found.", cls: "pulse-workout-muted" });
			return;
		}

		const fm = exercise.frontmatter;
		const unit = fm.unit;
		const entries = exercise.log;

		// ── Header with inline edit toggle ──
		const header = container.createDiv({ cls: "pulse-pm__main-head" });
		header.createEl("h2", { text: fm.name, cls: "pulse-pm__main-title" });

		const editBtn = header.createEl("button", {
			cls: "pulse-pm__glyph-btn clickable-icon",
		});
		setIcon(editBtn, "pencil");
		editBtn.setAttribute("aria-label", "Edit exercise");

		const meta = header.createDiv({ cls: "pulse-pm__main-meta" });
		if (fm.movement) meta.createSpan({ text: fm.movement, cls: "pulse-pm__tag" });
		if (fm.body_part) meta.createSpan({ text: fm.body_part, cls: "pulse-pm__tag" });
		if (fm.equipment) meta.createSpan({ text: fm.equipment, cls: "pulse-pm__tag" });
		meta.createSpan({ text: unit, cls: "pulse-pm__tag" });
		if (fm.tags && fm.tags.length > 0) {
			for (const tag of fm.tags) {
				meta.createSpan({ text: tag, cls: "pulse-pm__tag" });
			}
		}

		const body = container.createDiv({ cls: "pulse-pm__main-body" });

		// ── Edit form (hidden by default) ──
		const editSection = body.createDiv({ cls: "pulse-ex__edit-form" });
		editSection.style.display = "none";
		this.renderExerciseEditForm(editSection, exercise, path);

		let editing = false;
		editBtn.addEventListener("click", () => {
			editing = !editing;
			editSection.style.display = editing ? "flex" : "none";
			editBtn.toggleClass("pulse-pm__glyph-btn--active", editing);
		});

		// ── Stat cards ──
		const statsRow = body.createDiv({ cls: "pulse-log-stats" });

		if (entries.length > 0) {
			const lastEntry = entries[0];
			const lastCard = statsRow.createDiv({ cls: "pulse-log-card" });
			lastCard.createDiv({ text: "Last Done", cls: "pulse-log-card-label" });
			lastCard.createDiv({ text: relativeDate(lastEntry.date), cls: "pulse-log-card-value" });
			lastCard.createDiv({ text: lastEntry.date, cls: "pulse-log-card-sub" });
		}

		const pr = bestSet(entries);
		if (pr && pr.weight != null && pr.reps != null) {
			const prCard = statsRow.createDiv({ cls: "pulse-log-card pulse-log-card-accent" });
			prCard.createDiv({ text: "PR", cls: "pulse-log-card-label" });
			prCard.createDiv({ text: `${pr.weight} ${unit} × ${pr.reps}`, cls: "pulse-log-card-value" });
			const e1rm = estimate1RM(pr.weight, pr.reps);
			prCard.createDiv({ text: `Est. 1RM: ${e1rm} ${unit}`, cls: "pulse-log-card-sub" });
		}

		if (entries.length > 0) {
			const sessCard = statsRow.createDiv({ cls: "pulse-log-card" });
			sessCard.createDiv({ text: "Sessions", cls: "pulse-log-card-label" });
			sessCard.createDiv({ text: String(entries.length), cls: "pulse-log-card-value" });
			const totalSets = entries.reduce((s, e) => s + e.sets.length, 0);
			sessCard.createDiv({ text: `${totalSets} total sets`, cls: "pulse-log-card-sub" });

			const volCard = statsRow.createDiv({ cls: "pulse-log-card" });
			volCard.createDiv({ text: "Total Volume", cls: "pulse-log-card-label" });
			const totalVol = entries.reduce((s, e) => s + totalVolumeForEntry(e), 0);
			volCard.createDiv({ text: totalVol.toLocaleString(), cls: "pulse-log-card-value" });
			volCard.createDiv({ text: unit, cls: "pulse-log-card-sub" });
		}

		// ── E1RM progress chart (SVG) ──
		const weightEntries = entries.filter(e => e.sets.some(s => s.weight != null && s.reps != null && s.weight! > 0));
		if (weightEntries.length >= 2) {
			const chartSection = body.createDiv({ cls: "pulse-pm__section" });
			chartSection.createEl("h3", { text: "Estimated 1RM Progress", cls: "pulse-pm__section-title" });
			const svg = buildProgressSvg(weightEntries, 600, 160);
			chartSection.appendChild(svg);
		}

		// ── Activity heatmap ──
		if (entries.length > 0) {
			const activitySection = body.createDiv({ cls: "pulse-pm__section" });
			activitySection.createEl("h3", { text: "Activity", cls: "pulse-pm__section-title" });
			activitySection.appendChild(buildActivityStrip(entries));
		}

		// ── Session history with expandable sets ──
		const tableSection = body.createDiv({ cls: "pulse-pm__section" });
		tableSection.createEl("h3", { text: "Session History", cls: "pulse-pm__section-title" });

		if (entries.length === 0) {
			tableSection.createEl("p", { text: "No sessions logged yet.", cls: "pulse-workout-muted" });
		} else {
			for (const entry of entries) {
				this.renderExerciseLogEntry(tableSection, entry, unit, path);
			}
		}
	}

	private renderExerciseEditForm(container: HTMLElement, exercise: ExerciseNote, path: string): void {
		container.addClass("pulse-ex__edit-form");

		const MOVEMENTS = ["Push", "Pull", "Legs", "Core", "Cardio", "Olympic", "Isolation", "Compound", "Stretch", ""];
		const BODY_PARTS = ["Chest", "Back", "Shoulders", "Arms", "Biceps", "Triceps", "Legs", "Glutes", "Core", "Full body", "Cardio", ""];
		const EQUIPMENT = ["Barbell", "Dumbbell", "Bodyweight", "Cable", "Machine", "Kettlebell", "Band", "Smith Machine", ""];

		// Name
		const nameRow = container.createDiv({ cls: "pulse-ex__edit-row" });
		nameRow.createEl("label", { text: "Name", cls: "pulse-builder__control-label" });
		const nameInput = nameRow.createEl("input", {
			type: "text",
			cls: "pulse-builder__inline-input pulse-ex__edit-input",
			value: exercise.frontmatter.name,
		});

		// Movement (dropdown with custom option)
		const movRow = container.createDiv({ cls: "pulse-ex__edit-row" });
		movRow.createEl("label", { text: "Movement", cls: "pulse-builder__control-label" });
		const movSelect = movRow.createEl("select", { cls: "pulse-ex__edit-select" });
		const currentMov = exercise.frontmatter.movement;
		const movOptions = MOVEMENTS.includes(currentMov) ? MOVEMENTS : [currentMov, ...MOVEMENTS];
		for (const m of movOptions) {
			movSelect.createEl("option", { text: m || "(none)", value: m });
		}
		movSelect.value = currentMov;

		// Body part
		const bpRow = container.createDiv({ cls: "pulse-ex__edit-row" });
		bpRow.createEl("label", { text: "Body part", cls: "pulse-builder__control-label" });
		const bpSelect = bpRow.createEl("select", { cls: "pulse-ex__edit-select" });
		const currentBp = exercise.frontmatter.body_part ?? "";
		const bpOptions = BODY_PARTS.includes(currentBp) ? BODY_PARTS : [currentBp, ...BODY_PARTS];
		for (const b of bpOptions) {
			bpSelect.createEl("option", { text: b || "(none)", value: b });
		}
		bpSelect.value = currentBp;

		// Equipment (dropdown with custom option)
		const eqRow = container.createDiv({ cls: "pulse-ex__edit-row" });
		eqRow.createEl("label", { text: "Equipment", cls: "pulse-builder__control-label" });
		const eqSelect = eqRow.createEl("select", { cls: "pulse-ex__edit-select" });
		const currentEq = exercise.frontmatter.equipment;
		const eqOptions = EQUIPMENT.includes(currentEq) ? EQUIPMENT : [currentEq, ...EQUIPMENT];
		for (const e of eqOptions) {
			eqSelect.createEl("option", { text: e || "(none)", value: e });
		}
		eqSelect.value = currentEq;

		// Tags
		const tagRow = container.createDiv({ cls: "pulse-ex__edit-row" });
		tagRow.createEl("label", { text: "Tags", cls: "pulse-builder__control-label" });
		const tagInput = tagRow.createEl("input", {
			type: "text",
			cls: "pulse-builder__inline-input pulse-ex__edit-input",
			value: (exercise.frontmatter.tags ?? []).join(", "),
			placeholder: "comma-separated",
		});

		// Save button
		const actions = container.createDiv({ cls: "pulse-ex__edit-actions" });
		const saveBtn = actions.createEl("button", {
			text: "Save Changes",
			cls: "pulse-workout-btn pulse-workout-btn-primary pulse-workout-btn-small",
		});
		saveBtn.addEventListener("click", async () => {
			const dm = this.plugin.workoutDataManager;
			await dm.updateExercise(path, {
				name: nameInput.value.trim() || exercise.frontmatter.name,
				movement: movSelect.value,
				body_part: bpSelect.value,
				equipment: eqSelect.value,
				tags: tagInput.value.split(",").map(t => t.trim()).filter(Boolean),
			});
			new Notice("Exercise updated");
			this.view.navigate("exercise", path);
		});
	}

	private renderExerciseLogEntry(parent: HTMLElement, entry: ExerciseLogEntry, unit: string, exercisePath: string): void {
		const card = parent.createDiv({ cls: "pulse-ex__log-card" });

		const header = card.createDiv({ cls: "pulse-ex__log-card-head" });
		const dateArea = header.createDiv({ cls: "pulse-ex__log-card-date" });
		dateArea.createSpan({ text: entry.date });
		const ago = daysAgo(entry.date);
		if (ago <= 30) {
			dateArea.createSpan({ text: ` · ${relativeDate(entry.date)}`, cls: "pulse-workout-muted" });
		}

		const summary = header.createDiv({ cls: "pulse-ex__log-card-summary" });
		const vol = totalVolumeForEntry(entry);
		summary.createSpan({ text: `${entry.sets.length} sets` });
		if (vol > 0) {
			summary.createSpan({ text: ` · ${vol.toLocaleString()} ${unit}`, cls: "pulse-workout-muted" });
		}

		// Expand/collapse toggle
		const setsContainer = card.createDiv({ cls: "pulse-ex__log-sets" });
		setsContainer.style.display = "none";

		const table = setsContainer.createEl("table", { cls: "pulse-pm__table" });
		const thead = table.createEl("thead");
		const hRow = thead.createEl("tr");
		["Set", "Weight", "Reps", "1RM", "Note"].forEach(h => hRow.createEl("th", { text: h }));

		const tbody = table.createEl("tbody");
		for (const set of entry.sets) {
			const row = tbody.createEl("tr");
			row.createEl("td", { text: String(set.set) });
			row.createEl("td", { text: set.weight != null ? `${set.weight} ${unit}` : "—" });
			row.createEl("td", { text: set.reps != null ? String(set.reps) : "—" });
			const e1rm = (set.weight != null && set.reps != null && set.weight > 0)
				? String(estimate1RM(set.weight, set.reps))
				: "—";
			row.createEl("td", { text: e1rm });
			row.createEl("td", { text: set.note ?? "" });
		}

		let expanded = false;
		header.style.cursor = "pointer";
		header.addEventListener("click", () => {
			expanded = !expanded;
			setsContainer.style.display = expanded ? "block" : "none";
			card.toggleClass("pulse-ex__log-card--expanded", expanded);
		});

		// If it has a session path, link to it
		if (entry.sessionPath) {
			const linkRow = setsContainer.createDiv({ cls: "pulse-ex__log-session-link" });
			const link = linkRow.createEl("span", { text: "View full session →", cls: "pulse-pm__link" });
			link.addEventListener("click", async (e) => {
				e.stopPropagation();
				const sess = await this.plugin.workoutDataManager.getSession(entry.sessionPath!);
				if (sess && isStandaloneSession(sess)) {
					this.view.navigate("workout-edit", entry.sessionPath);
				} else {
					this.view.navigate("session", entry.sessionPath);
				}
			});
		}
	}

	// ── Session detail ──

	private async renderSession(container: HTMLElement): Promise<void> {
		const path = this.view.activePath;
		if (!path) {
			container.createEl("p", { text: "No session selected.", cls: "pulse-workout-muted" });
			return;
		}

		const dm = this.plugin.workoutDataManager;
		const session = await dm.getSession(path);
		if (!session) {
			container.createEl("p", { text: "Session not found.", cls: "pulse-workout-muted" });
			return;
		}

		const dayName = session.frontmatter.programDay ?? "Workout";
		const header = container.createDiv({ cls: "pulse-pm__main-head" });
		header.createEl("h2", {
			text: `${session.frontmatter.date} — ${dayName}`,
			cls: "pulse-pm__main-title",
		});

		const meta = header.createDiv({ cls: "pulse-pm__main-meta" });
		if (session.frontmatter.duration) {
			meta.createSpan({ text: `${session.frontmatter.duration} min`, cls: "pulse-pm__tag" });
		}
		if (session.frontmatter.program) {
			meta.createSpan({ text: session.frontmatter.program, cls: "pulse-pm__tag" });
		}

		const body = container.createDiv({ cls: "pulse-pm__main-body" });

		if (session.session.exercises.length === 0) {
			body.createEl("p", { text: "No exercises recorded.", cls: "pulse-workout-muted" });
			return;
		}

		for (const exercise of session.session.exercises) {
			const exSection = body.createDiv({ cls: "pulse-pm__exercise-block" });
			const name = exercise.exercisePath.split("/").pop()?.replace(".md", "") ?? exercise.exercisePath;

			const exHeader = exSection.createDiv({ cls: "pulse-pm__exercise-block-head" });
			exHeader.createEl("h4", { text: name });
			exHeader.addEventListener("click", () => {
				this.view.navigate("exercise", exercise.exercisePath);
			});
			exHeader.style.cursor = "pointer";

			const table = exSection.createEl("table", { cls: "pulse-pm__table" });
			const thead = table.createEl("thead");
			const hRow = thead.createEl("tr");
			["Set", "Weight", "Reps", "Note"].forEach(h => hRow.createEl("th", { text: h }));

			const tbody = table.createEl("tbody");
			for (const set of exercise.sets) {
				const row = tbody.createEl("tr");
				row.createEl("td", { text: String(set.set) });
				row.createEl("td", {
					text: set.weight != null ? `${set.weight} ${this.plugin.settings.weightUnit}` : "—",
				});
				row.createEl("td", { text: set.reps != null ? String(set.reps) : "—" });
				row.createEl("td", { text: set.note ?? "" });
			}
		}
	}

	// ── Workout edit (standalone sessions) ──

	private async renderWorkoutEdit(container: HTMLElement): Promise<void> {
		const path = this.view.activePath;
		if (!path) {
			container.createEl("p", { text: "No workout selected.", cls: "pulse-workout-muted" });
			return;
		}

		const dm = this.plugin.workoutDataManager;
		const session = await dm.getSession(path);
		if (!session) {
			container.createEl("p", { text: "Workout not found.", cls: "pulse-workout-muted" });
			return;
		}

		const unit = this.plugin.settings.weightUnit;
		const dayName = session.frontmatter.programDay ?? "Workout";

		const header = container.createDiv({ cls: "pulse-pm__main-head pulse-pm__main-head--split" });
		const headRow = header.createDiv({ cls: "pulse-pm__main-title-row" });
		headRow.createEl("h2", {
			text: `Edit — ${session.frontmatter.date} — ${dayName}`,
			cls: "pulse-pm__main-title",
		});
		if (isStandaloneSession(session)) {
			const delBtn = headRow.createEl("button", {
				cls: "pulse-pm__glyph-btn clickable-icon",
				attr: { type: "button", "aria-label": "Delete workout" },
			});
			setIcon(delBtn, "trash-2");
			delBtn.addEventListener("click", async () => {
				if (
					!window.confirm(
						"Delete this workout? The note will be moved to Trash.",
					)
				) {
					return;
				}
				await dm.deleteSession(path);
				new Notice("Workout deleted");
				this.view.navigate("today");
			});
		}

		const body = container.createDiv({ cls: "pulse-pm__main-body pulse-pm__workout-edit" });

		const fmRow = body.createDiv({ cls: "pulse-pm__workout-edit-fm" });
		const dateField = fmRow.createDiv({ cls: "pulse-pm__workout-edit-field" });
		dateField.createEl("label", {
			cls: "pulse-builder__control-label",
			text: "Date",
			attr: { for: "pulse-workout-edit-date" },
		});
		const dateInput = dateField.createEl("input", {
			type: "text",
			cls: "pulse-builder__inline-input",
			attr: { id: "pulse-workout-edit-date" },
			value: session.frontmatter.date,
		});

		const durField = fmRow.createDiv({ cls: "pulse-pm__workout-edit-field" });
		durField.createEl("label", {
			cls: "pulse-builder__control-label",
			text: "Duration (min)",
			attr: { for: "pulse-workout-edit-dur" },
		});
		const durInput = durField.createEl("input", {
			type: "text",
			cls: "pulse-builder__inline-input",
			attr: { id: "pulse-workout-edit-dur" },
			value: session.frontmatter.duration != null ? String(session.frontmatter.duration) : "",
			placeholder: "optional",
		});

		const bwField = fmRow.createDiv({ cls: "pulse-pm__workout-edit-field" });
		bwField.createEl("label", {
			cls: "pulse-builder__control-label",
			text: "Bodyweight",
			attr: { for: "pulse-workout-edit-bw" },
		});
		const bwInput = bwField.createEl("input", {
			type: "text",
			cls: "pulse-builder__inline-input",
			attr: { id: "pulse-workout-edit-bw" },
			value: session.frontmatter.bodyweight != null ? String(session.frontmatter.bodyweight) : "",
			placeholder: "optional",
		});

		const notesWrap = body.createDiv({ cls: "pulse-pm__workout-edit-notes" });
		notesWrap.createEl("label", { cls: "pulse-builder__control-label", text: "Notes", attr: { for: "pulse-workout-edit-notes" } });
		const notesInput = notesWrap.createEl("textarea", {
			cls: "pulse-builder__inline-input pulse-pm__workout-edit-notes-area",
			attr: { id: "pulse-workout-edit-notes", rows: "3" },
		});
		notesInput.value = session.frontmatter.notes ?? "";

		const exercisesHost = body.createDiv({ cls: "pulse-pm__workout-edit-ex-host" });

		type SetFieldInputs = {
			weight: HTMLInputElement;
			reps: HTMLInputElement;
			duration: HTMLInputElement;
			distance: HTMLInputElement;
			note: HTMLInputElement;
		};
		const draftExercises: SessionExercise[] = session.session.exercises.map(ex => ({
			exercisePath: ex.exercisePath,
			order: ex.order,
			sets: ex.sets.map(s => ({ ...s })),
		}));
		const collectSetInputs: SetFieldInputs[][] = [];

		const parseOptFloat = (s: string): number | undefined => {
			const t = s.trim();
			if (t === "") return undefined;
			const n = parseFloat(t);
			return Number.isFinite(n) ? n : undefined;
		};
		const parseOptInt = (s: string): number | undefined => {
			const t = s.trim();
			if (t === "") return undefined;
			const n = parseInt(t, 10);
			return Number.isFinite(n) ? n : undefined;
		};

		const renderExerciseBlocks = (): void => {
			exercisesHost.empty();
			collectSetInputs.length = 0;

			for (let ei = 0; ei < draftExercises.length; ei++) {
				const exercise = draftExercises[ei];
				const exSection = exercisesHost.createDiv({ cls: "pulse-pm__exercise-block pulse-pm__workout-edit-ex" });
				const name = exercise.exercisePath.split("/").pop()?.replace(".md", "") ?? exercise.exercisePath;

				const exHeader = exSection.createDiv({ cls: "pulse-pm__exercise-block-head pulse-pm__exercise-block-head--row" });
				const title = exHeader.createEl("h4", { text: name });
				title.style.cursor = "pointer";
				title.addEventListener("click", () => {
					this.view.navigate("exercise", exercise.exercisePath);
				});

				const rmEx = exHeader.createEl("button", {
					text: "Remove exercise",
					cls: "pulse-workout-btn pulse-workout-btn-link pulse-workout-btn-small",
					attr: { type: "button" },
				});
				rmEx.addEventListener("click", () => {
					draftExercises.splice(ei, 1);
					renderExerciseBlocks();
				});

				const table = exSection.createEl("table", { cls: "pulse-pm__table" });
				const thead = table.createEl("thead");
				const hRow = thead.createEl("tr");
				for (const h of ["Set", `Weight (${unit})`, "Reps", "Duration (s)", "Distance", "Note", ""]) {
					hRow.createEl("th", { text: h });
				}

				const tbody = table.createEl("tbody");
				const rowInputs: SetFieldInputs[] = [];
				for (let si = 0; si < exercise.sets.length; si++) {
					const set = exercise.sets[si];
					const row = tbody.createEl("tr");
					row.createEl("td", { text: String(si + 1) });
					const wIn = row.createEl("td").createEl("input", {
						type: "text",
						cls: "pulse-builder__inline-input",
						value: set.weight != null ? String(set.weight) : "",
					});
					const rIn = row.createEl("td").createEl("input", {
						type: "text",
						cls: "pulse-builder__inline-input",
						value: set.reps != null ? String(set.reps) : "",
					});
					const dIn = row.createEl("td").createEl("input", {
						type: "text",
						cls: "pulse-builder__inline-input",
						value: set.duration != null ? String(set.duration) : "",
					});
					const distIn = row.createEl("td").createEl("input", {
						type: "text",
						cls: "pulse-builder__inline-input",
						value: set.distance != null ? String(set.distance) : "",
					});
					const nIn = row.createEl("td").createEl("input", {
						type: "text",
						cls: "pulse-builder__inline-input",
						value: set.note ?? "",
					});
					const actCell = row.createEl("td");
					if (exercise.sets.length > 1) {
						const rmSet = actCell.createEl("button", {
							text: "Remove",
							cls: "pulse-workout-btn pulse-workout-btn-link pulse-workout-btn-small",
							attr: { type: "button" },
						});
						rmSet.addEventListener("click", () => {
							exercise.sets.splice(si, 1);
							exercise.sets.forEach((s, i) => { s.set = i + 1; });
							renderExerciseBlocks();
						});
					}
					rowInputs.push({ weight: wIn, reps: rIn, duration: dIn, distance: distIn, note: nIn });
				}
				collectSetInputs.push(rowInputs);
			}
		};

		renderExerciseBlocks();

		const actions = body.createDiv({ cls: "pulse-pm__workout-edit-actions" });
		const saveBtn = actions.createEl("button", {
			text: "Save workout",
			cls: "pulse-workout-btn pulse-workout-btn-primary pulse-workout-btn-small",
		});
		saveBtn.addEventListener("click", async () => {
			const dateStr = dateInput.value.trim() || session.frontmatter.date;
			const durStr = durInput.value.trim();
			const duration = durStr === "" ? undefined : parseOptFloat(durStr);
			const bwStr = bwInput.value.trim();
			const bodyweight = bwStr === "" ? undefined : parseOptFloat(bwStr);
			const notes = notesInput.value.trim() || undefined;

			const exercises: SessionExercise[] = draftExercises.map((ex, ei) => ({
				exercisePath: ex.exercisePath,
				order: ei + 1,
				sets: collectSetInputs[ei].map((inputs, si) => ({
					set: si + 1,
					weight: parseOptFloat(inputs.weight.value),
					reps: parseOptInt(inputs.reps.value),
					duration: parseOptInt(inputs.duration.value),
					distance: parseOptFloat(inputs.distance.value),
					note: inputs.note.value.trim() || undefined,
				})),
			}));

			const updated: SessionNote = {
				file: session.file,
				frontmatter: {
					...session.frontmatter,
					date: dateStr,
					duration,
					bodyweight,
					notes,
				},
				session: { exercises },
			};

			await dm.saveSession(path, updated);
			new Notice("Workout saved");
			this.view.navigate("workout-edit", path);
		});
	}

	// ── Program detail ──

	private async renderProgram(container: HTMLElement): Promise<void> {
		const path = this.view.activePath;
		if (!path) {
			container.createEl("p", { text: "No program selected.", cls: "pulse-workout-muted" });
			return;
		}

		const dm = this.plugin.workoutDataManager;
		const programs = await dm.getAllPrograms();
		const program = programs.find(p => p.file.path === path);
		if (!program) {
			container.createEl("p", { text: "Program not found.", cls: "pulse-workout-muted" });
			return;
		}

		const header = container.createDiv({ cls: "pulse-pm__main-head" });
		header.createEl("h2", { text: program.name, cls: "pulse-pm__main-title" });

		const editBtn = header.createEl("button", {
			text: "Edit Program",
			cls: "pulse-workout-btn pulse-workout-btn-secondary pulse-workout-btn-small",
		});
		editBtn.addEventListener("click", () => this.view.navigate("edit-program", path));

		const meta = container.createDiv({ cls: "pulse-pm__main-meta" });
		meta.createSpan({
			text: program.active ? "Active" : "Inactive",
			cls: `pulse-pm__tag ${program.active ? "pulse-pm__tag--accent" : ""}`,
		});
		meta.createSpan({ text: program.schedule.join(", "), cls: "pulse-pm__tag" });
		meta.createSpan({
			text: program.rotation === "weekday-mapped" ? "Weekday-mapped" : "Sequential",
			cls: "pulse-pm__tag",
		});

		const body = container.createDiv({ cls: "pulse-pm__main-body" });

		for (const day of program.days) {
			const daySection = body.createDiv({ cls: "pulse-pm__day-block" });
			daySection.createEl("h3", { text: day.name, cls: "pulse-pm__section-title" });

			const table = daySection.createEl("table", { cls: "pulse-pm__table" });
			const thead = table.createEl("thead");
			const hRow = thead.createEl("tr");
			["Exercise", "Sets", "Reps/Duration"].forEach(h => hRow.createEl("th", { text: h }));

			const tbody = table.createEl("tbody");
			for (const ex of day.exercises) {
				const row = tbody.createEl("tr");
				const nameCell = row.createEl("td");
				const exName = ex.exercisePath.split("/").pop()?.replace(".md", "") ?? ex.exercisePath;
				const link = nameCell.createEl("span", { text: exName, cls: "pulse-pm__link" });
				link.addEventListener("click", () => this.view.navigate("exercise", ex.exercisePath));

				row.createEl("td", { text: String(ex.sets) });
				row.createEl("td", {
					text: ex.reps ? String(ex.reps) : ex.duration ? `${ex.duration}s` : "—",
				});
			}
		}
	}

	// ── New exercise form ──

	private async renderNewExercise(container: HTMLElement): Promise<void> {
		const header = container.createDiv({ cls: "pulse-pm__main-head" });
		header.createEl("h2", { text: "New Exercise", cls: "pulse-pm__main-title" });

		const body = container.createDiv({ cls: "pulse-pm__main-body" });
		const exercisesTab = new ExercisesTab(this.plugin);
		exercisesTab.renderNewExerciseForm(body, () => {
			this.view.navigate("today");
		});
	}

	// ── Workout Builder ──

	private async renderWorkoutBuilder(container: HTMLElement): Promise<void> {
		const header = container.createDiv({ cls: "pulse-pm__main-head" });
		header.createEl("h2", { text: "Build Workout", cls: "pulse-pm__main-title" });

		const body = container.createDiv({ cls: "pulse-pm__main-body" });
		const builder = new WorkoutBuilder(this.plugin, this.view);
		await builder.render(body);
	}

	// ── Program Builder ──

	private async renderProgramBuilder(container: HTMLElement): Promise<void> {
		const header = container.createDiv({ cls: "pulse-pm__main-head" });
		header.createEl("h2", { text: "New Program", cls: "pulse-pm__main-title" });

		const body = container.createDiv({ cls: "pulse-pm__main-body" });
		const builder = new ProgramBuilder(this.plugin, this.view);
		await builder.render(body);
	}

	// ── Edit Program ──

	private async renderEditProgram(container: HTMLElement): Promise<void> {
		const path = this.view.activePath;
		if (!path) {
			container.createEl("p", { text: "No program selected.", cls: "pulse-workout-muted" });
			return;
		}

		const header = container.createDiv({ cls: "pulse-pm__main-head" });
		header.createEl("h2", { text: "Edit Program", cls: "pulse-pm__main-title" });

		const body = container.createDiv({ cls: "pulse-pm__main-body" });
		const builder = new ProgramBuilder(this.plugin, this.view);
		await builder.render(body, path);
	}

	destroy(): void {
		this.todayTab?.destroy();
		this.historyTab?.destroy();
		this.statsTab?.destroy();
		if (this.chart) { this.chart.destroy(); this.chart = null; }
		this.container = null;
	}
}
