import { Notice, setIcon } from "obsidian";
import type PulsePlugin from "../main";
import type {
	ActiveWorkoutState, ActiveExercise, ActiveSet, ProgramDay,
	ExerciseNote, SetEntry, SessionExercise, SessionNote,
} from "./types";
import {
	isCardioMovement,
	defaultDistanceUnit,
	parseDistanceUnit,
	type DistanceUnit,
} from "./exerciseKind";

export interface TodayTabOptions {
	startImmediately?: boolean;
}

const STORAGE_KEY = "pulse-active-workout";

function splitDurationSeconds(sec: number | undefined): { min: string; s: string } {
	if (sec == null || sec < 0) return { min: "", s: "" };
	const m = Math.floor(sec / 60);
	const s = sec % 60;
	return { min: String(m), s: String(s) };
}

function parseMinSecToDuration(minStr: string, secStr: string): number | undefined {
	const m = parseInt(minStr, 10);
	const s = parseInt(secStr, 10);
	const min = isNaN(m) ? 0 : Math.max(0, m);
	const sec = isNaN(s) ? 0 : Math.max(0, Math.min(59, s));
	const total = min * 60 + sec;
	return total > 0 ? total : undefined;
}

function distanceUnitLabel(u: DistanceUnit): string {
	if (u === "km") return "km";
	if (u === "m") return "m";
	return "mi";
}

function formatDurationClock(sec: number | undefined): string {
	if (sec == null || sec < 0) return "";
	const m = Math.floor(sec / 60);
	const s = sec % 60;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

function previousCardioFromLog(note: ExerciseNote | null): { duration?: number; distance?: number } | undefined {
	if (!note || note.log.length === 0) return undefined;
	const entry = note.log[0];
	if (entry.sets.length === 0) return undefined;
	const last = entry.sets[entry.sets.length - 1];
	if (last.duration == null && last.distance == null) return undefined;
	return { duration: last.duration, distance: last.distance };
}

export class TodayTab {
	private plugin: PulsePlugin;
	private options: TodayTabOptions;
	private container: HTMLElement | null = null;
	private state: ActiveWorkoutState | null = null;
	private timerInterval: number | null = null;
	private restTimerInterval: number | null = null;
	private restEndTime: number | null = null;

	constructor(plugin: PulsePlugin, options: TodayTabOptions) {
		this.plugin = plugin;
		this.options = options;
	}

	render(container: HTMLElement): void {
		this.container = container;
		this.loadPersistedState();

		if (this.state) {
			this.renderActiveWorkout();
		} else if (this.options.startImmediately) {
			this.startWorkout();
		} else {
			this.renderIdle();
		}
	}

	destroy(): void {
		if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
		if (this.restTimerInterval) { clearInterval(this.restTimerInterval); this.restTimerInterval = null; }
	}

	// --------------- Idle State ---------------

	private async renderIdle(): Promise<void> {
		if (!this.container) return;
		this.container.empty();
		const idle = this.container.createDiv({ cls: "pulse-workout-idle" });

		const dm = this.plugin.workoutDataManager;

		// Check for saved-but-incomplete sessions from today (or recent)
		const incomplete = await dm.getIncompleteSessions(5);
		if (incomplete.length > 0) {
			const resumeSection = idle.createDiv({ cls: "pulse-workout-resume-section" });
			resumeSection.createEl("h3", { text: "Resume Workout" });

			for (const session of incomplete) {
				const card = resumeSection.createDiv({ cls: "pulse-workout-resume-card" });
				const info = card.createDiv({ cls: "pulse-workout-resume-info" });
				const dayName = session.frontmatter.programDay ?? "Workout";
				info.createSpan({ text: dayName, cls: "pulse-workout-resume-name" });
				info.createSpan({
					text: `${session.frontmatter.date} · ${session.session.exercises.length} exercises`,
					cls: "pulse-workout-muted",
				});
				const completedSets = session.session.exercises.reduce(
					(sum, ex) => sum + ex.sets.filter(s =>
						s.weight != null || s.reps != null || s.duration != null || s.distance != null,
					).length,
					0,
				);
				const totalSets = session.session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
				if (totalSets > 0) {
					info.createSpan({
						text: `${completedSets}/${totalSets} sets logged`,
						cls: "pulse-workout-muted",
					});
				}

				const actions = card.createDiv({ cls: "pulse-workout-resume-actions" });
				const resumeBtn = actions.createEl("button", {
					text: "Resume",
					cls: "pulse-workout-btn pulse-workout-btn-primary pulse-workout-btn-small",
				});
				resumeBtn.addEventListener("click", () => this.resumeSession(session));

				const deleteBtn = actions.createEl("button", {
					text: "Discard",
					cls: "pulse-workout-btn pulse-workout-btn-link pulse-workout-btn-small",
				});
				deleteBtn.addEventListener("click", async () => {
					await dm.deleteSession(session.file.path);
					this.renderIdle();
				});
			}
		}

		// Scheduled workout from program
		const nextDay = await dm.getNextProgramDay();

		if (nextDay) {
			const preview = idle.createDiv({ cls: "pulse-workout-preview" });
			preview.createEl("h3", { text: `Today: ${nextDay.day.name}` });
			preview.createEl("p", { text: nextDay.program.name, cls: "pulse-workout-muted" });

			const exerciseList = preview.createDiv({ cls: "pulse-workout-preview-list" });
			for (const ex of nextDay.day.exercises) {
				const name = ex.exercisePath.split("/").pop()?.replace(".md", "") ?? ex.exercisePath;
				const detail = ex.reps ? `${ex.sets} × ${ex.reps}` : `${ex.sets} sets`;
				const row = exerciseList.createDiv({ cls: "pulse-workout-preview-item" });
				row.createSpan({ text: name });
				row.createSpan({ text: detail, cls: "pulse-workout-muted" });
			}

			const startBtn = idle.createEl("button", {
				text: `Start ${nextDay.day.name}`,
				cls: "pulse-workout-btn pulse-workout-btn-primary",
			});
			startBtn.addEventListener("click", () => this.startWorkout(nextDay.day, nextDay.program.name));
		} else if (incomplete.length === 0) {
			idle.createEl("p", { text: "No workout scheduled for today.", cls: "pulse-workout-muted" });
		}

		const emptyBtn = idle.createEl("button", {
			text: "Start Empty Workout",
			cls: `pulse-workout-btn ${nextDay || incomplete.length > 0 ? "pulse-workout-btn-secondary" : "pulse-workout-btn-primary"}`,
		});
		emptyBtn.addEventListener("click", () => this.startWorkout());

		const programBtn = idle.createEl("button", {
			text: "Choose Program",
			cls: "pulse-workout-btn pulse-workout-btn-link",
		});
		programBtn.addEventListener("click", () => this.showProgramPicker());
	}

	// --------------- Active Workout ---------------

	private async startWorkout(programDay?: ProgramDay, programName?: string): Promise<void> {
		const dm = this.plugin.workoutDataManager;
		const exercises: ActiveExercise[] = [];

		if (programDay) {
			for (const pe of programDay.exercises) {
				const exerciseNote = await dm.getExercise(pe.exercisePath);
				const name = exerciseNote?.frontmatter.name ?? pe.exercisePath.split("/").pop()?.replace(".md", "") ?? "Exercise";
				const movement = exerciseNote?.frontmatter.movement ?? "";
				const distanceUnit = parseDistanceUnit(exerciseNote?.frontmatter["distance-unit"]) ?? defaultDistanceUnit();
				const cardio = isCardioMovement(movement);

				let previousBest: { weight: number; reps: number } | undefined;
				if (!cardio && exerciseNote && exerciseNote.log.length > 0) {
					const lastSets = exerciseNote.log[0].sets;
					const bestSet = lastSets.reduce<SetEntry | null>((best, s) => {
						if (s.weight != null && s.reps != null && (!best || (s.weight ?? 0) > (best.weight ?? 0))) return s;
						return best;
					}, null);
					if (bestSet?.weight != null && bestSet?.reps != null) {
						previousBest = { weight: bestSet.weight, reps: bestSet.reps };
					}
				}

				const sets: ActiveSet[] = Array.from({ length: pe.sets }, (_, i) => (
					cardio
						? {
							set: i + 1,
							duration: pe.duration,
							distance: undefined,
							completed: false,
						}
						: {
							set: i + 1,
							weight: previousBest?.weight,
							reps: pe.reps,
							duration: pe.duration,
							completed: false,
						}
				));

				exercises.push({
					exercisePath: pe.exercisePath,
					exerciseName: name,
					movement,
					distanceUnit,
					sets,
					previousBest,
					previousCardio: cardio ? previousCardioFromLog(exerciseNote) : undefined,
				});
			}
		}

		this.state = {
			sessionPath: null,
			programName,
			programDayName: programDay?.name,
			exercises,
			startTime: Date.now(),
		};

		this.persistState();
		this.renderActiveWorkout();
	}

	private async resumeSession(session: SessionNote): Promise<void> {
		const dm = this.plugin.workoutDataManager;
		const exercises: ActiveExercise[] = [];

		for (const ex of session.session.exercises) {
			const exerciseNote = await dm.getExercise(ex.exercisePath);
			const name = exerciseNote?.frontmatter.name
				?? ex.exercisePath.split("/").pop()?.replace(".md", "")
				?? "Exercise";
			const movement = exerciseNote?.frontmatter.movement ?? "";
			const distanceUnit = parseDistanceUnit(exerciseNote?.frontmatter["distance-unit"]) ?? defaultDistanceUnit();
			const cardio = isCardioMovement(movement);

			let previousBest: { weight: number; reps: number } | undefined;
			if (!cardio && exerciseNote && exerciseNote.log.length > 0) {
				const lastSets = exerciseNote.log[0].sets;
				const bestSet = lastSets.reduce<SetEntry | null>((best, s) => {
					if (s.weight != null && s.reps != null && (!best || (s.weight ?? 0) > (best.weight ?? 0))) return s;
					return best;
				}, null);
				if (bestSet?.weight != null && bestSet?.reps != null) {
					previousBest = { weight: bestSet.weight, reps: bestSet.reps };
				}
			}

			const sets: ActiveSet[] = ex.sets.map(s => ({
				set: s.set,
				weight: s.weight,
				reps: s.reps,
				duration: s.duration,
				distance: s.distance,
				note: s.note,
				completed: !!(s.weight != null || s.reps != null || (s.duration != null && s.duration > 0) || s.distance != null),
			}));

			exercises.push({
				exercisePath: ex.exercisePath,
				exerciseName: name,
				movement,
				distanceUnit,
				sets,
				previousBest,
				previousCardio: cardio ? previousCardioFromLog(exerciseNote) : undefined,
			});
		}

		const startTime = session.frontmatter.startTime
			? new Date(session.frontmatter.startTime).getTime()
			: Date.now();

		this.state = {
			sessionPath: session.file.path,
			programName: session.frontmatter.program,
			programDayName: session.frontmatter.programDay,
			exercises,
			startTime: isNaN(startTime) ? Date.now() : startTime,
			bodyweight: session.frontmatter.bodyweight,
		};

		this.persistState();
		this.renderActiveWorkout();
	}

	private renderActiveWorkout(): void {
		if (!this.container || !this.state) return;
		this.container.empty();

		const wrapper = this.container.createDiv({ cls: "pulse-workout-active" });

		// Timer bar
		const timerBar = wrapper.createDiv({ cls: "pulse-workout-timer-bar" });
		if (this.state.programDayName) {
			timerBar.createSpan({ text: this.state.programDayName, cls: "pulse-workout-session-name" });
		}
		const timerEl = timerBar.createSpan({ cls: "pulse-workout-elapsed" });
		this.updateElapsedTimer(timerEl);
		this.timerInterval = window.setInterval(() => this.updateElapsedTimer(timerEl), 1000);

		// Rest timer placeholder
		const restTimerContainer = wrapper.createDiv({ cls: "pulse-workout-rest-timer-container" });
		restTimerContainer.style.display = "none";

		// Exercise list
		const exerciseList = wrapper.createDiv({ cls: "pulse-workout-exercise-list" });
		for (let exIdx = 0; exIdx < this.state.exercises.length; exIdx++) {
			this.renderExerciseCard(exerciseList, exIdx, restTimerContainer);
		}

		// Add exercise button
		const addExBtn = wrapper.createEl("button", {
			text: "+ Add Exercise",
			cls: "pulse-workout-btn pulse-workout-btn-secondary",
		});
		addExBtn.addEventListener("click", () => this.showAddExercise());

		// Bottom action bar
		const actionBar = wrapper.createDiv({ cls: "pulse-workout-action-bar" });

		const saveBtn = actionBar.createEl("button", {
			text: "Save for Later",
			cls: "pulse-workout-btn pulse-workout-btn-secondary",
		});
		saveBtn.addEventListener("click", () => this.saveForLater());

		const finishBtn = actionBar.createEl("button", {
			text: "Finish Workout",
			cls: "pulse-workout-btn pulse-workout-btn-finish",
		});
		finishBtn.addEventListener("click", () => this.finishWorkout());
	}

	private renderExerciseCard(parent: HTMLElement, exIdx: number, restTimerContainer: HTMLElement): void {
		if (!this.state) return;
		const exercise = this.state.exercises[exIdx];
		const cardio = isCardioMovement(exercise.movement);
		const card = parent.createDiv({ cls: "pulse-workout-exercise-card" });

		const unit = this.plugin.settings.weightUnit;

		const header = card.createDiv({ cls: "pulse-workout-exercise-header" });
		header.createEl("h4", { text: exercise.exerciseName, cls: "pulse-workout-exercise-title" });
		if (cardio && exercise.previousCardio) {
			const { duration, distance } = exercise.previousCardio;
			const parts: string[] = [];
			const clock = formatDurationClock(duration);
			if (clock) parts.push(clock);
			if (distance != null) parts.push(`${distance} ${distanceUnitLabel(exercise.distanceUnit)}`);
			if (parts.length > 0) {
				header.createSpan({
					text: `Last: ${parts.join(" · ")}`,
					cls: "pulse-workout-muted pulse-workout-exercise-last",
				});
			}
		} else if (exercise.previousBest) {
			header.createSpan({
				text: `Last: ${exercise.previousBest.weight} × ${exercise.previousBest.reps}`,
				cls: "pulse-workout-muted pulse-workout-exercise-last",
			});
		}

		const setHeaders = card.createDiv({
			cls: `pulse-workout-set-header${cardio ? " pulse-workout-set-header--cardio" : ""}`,
		});
		setHeaders.createSpan({ text: "Set", cls: "pulse-workout-set-header-label" });
		if (cardio) {
			setHeaders.createSpan({ text: "Time", cls: "pulse-workout-set-header-label" });
			setHeaders.createSpan({
				text: `Distance (${distanceUnitLabel(exercise.distanceUnit)})`,
				cls: "pulse-workout-set-header-label",
			});
		} else {
			setHeaders.createSpan({ text: `Weight (${unit})`, cls: "pulse-workout-set-header-label" });
			setHeaders.createSpan({ text: "Reps", cls: "pulse-workout-set-header-label" });
		}
		setHeaders.createSpan({ text: "", cls: "pulse-workout-set-header-spacer" });

		const setsContainer = card.createDiv({ cls: "pulse-workout-sets" });
		for (let sIdx = 0; sIdx < exercise.sets.length; sIdx++) {
			this.renderSetRow(setsContainer, exIdx, sIdx, restTimerContainer);
		}

		const addSetBtn = card.createEl("button", {
			text: "+ Add Set",
			cls: "pulse-workout-btn pulse-workout-btn-small",
		});
		addSetBtn.addEventListener("click", () => {
			if (!this.state) return;
			const ex = this.state.exercises[exIdx];
			const sets = ex.sets;
			const lastSet = sets[sets.length - 1];
			const isCardio = isCardioMovement(ex.movement);
			sets.push(
				isCardio
					? {
						set: sets.length + 1,
						duration: lastSet?.duration,
						distance: lastSet?.distance,
						completed: false,
					}
					: {
						set: sets.length + 1,
						weight: lastSet?.weight,
						reps: lastSet?.reps,
						duration: lastSet?.duration,
						completed: false,
					},
			);
			this.persistState();
			this.renderActiveWorkout();
		});
	}

	private renderSetRow(parent: HTMLElement, exIdx: number, sIdx: number, restTimerContainer: HTMLElement): void {
		if (!this.state) return;
		const exercise = this.state.exercises[exIdx];
		const set = exercise.sets[sIdx];
		const cardio = isCardioMovement(exercise.movement);
		const row = parent.createDiv({
			cls: `pulse-workout-set-row${cardio ? " pulse-workout-set-row--cardio" : ""} ${set.completed ? "pulse-workout-set-completed" : ""}`,
		});

		row.createSpan({ text: String(set.set), cls: "pulse-workout-set-num" });

		if (cardio) {
			const { min, s } = splitDurationSeconds(set.duration);
			const timeWrap = row.createDiv({ cls: "pulse-workout-set-time" });
			const minInput = timeWrap.createEl("input", {
				type: "text",
				cls: "pulse-workout-input pulse-workout-input--log pulse-workout-input--time",
				value: min,
				placeholder: "m",
				attr: { inputmode: "numeric" },
			});
			timeWrap.createSpan({ text: ":", cls: "pulse-workout-set-time-sep" });
			const secInput = timeWrap.createEl("input", {
				type: "text",
				cls: "pulse-workout-input pulse-workout-input--log pulse-workout-input--time",
				value: s,
				placeholder: "s",
				attr: { inputmode: "numeric" },
			});
			const applyDuration = (): void => {
				if (!this.state) return;
				const d = parseMinSecToDuration(minInput.value, secInput.value);
				this.state.exercises[exIdx].sets[sIdx].duration = d;
				this.persistState();
			};
			minInput.addEventListener("change", applyDuration);
			secInput.addEventListener("change", applyDuration);

			const distWrap = row.createDiv({ cls: "pulse-workout-set-distance" });
			const distInput = distWrap.createEl("input", {
				type: "text",
				cls: "pulse-workout-input pulse-workout-input--log",
				value: set.distance != null ? String(set.distance) : "",
				placeholder: "—",
				attr: { inputmode: "decimal" },
			});
			distWrap.createSpan({
				text: distanceUnitLabel(exercise.distanceUnit),
				cls: "pulse-workout-distance-unit",
			});
			distInput.addEventListener("change", (e) => {
				if (!this.state) return;
				const val = parseFloat((e.target as HTMLInputElement).value);
				this.state.exercises[exIdx].sets[sIdx].distance = isNaN(val) ? undefined : val;
				this.persistState();
			});
		} else {
			const weightInput = row.createEl("input", {
				type: "text",
				cls: "pulse-workout-input pulse-workout-input--log",
				value: set.weight != null ? String(set.weight) : "",
				placeholder: "—",
				attr: { inputmode: "decimal" },
			});
			weightInput.addEventListener("change", (e) => {
				if (!this.state) return;
				const val = parseFloat((e.target as HTMLInputElement).value);
				this.state.exercises[exIdx].sets[sIdx].weight = isNaN(val) ? undefined : val;
				this.persistState();
			});

			const repsInput = row.createEl("input", {
				type: "text",
				cls: "pulse-workout-input pulse-workout-input--log",
				value: set.reps != null ? String(set.reps) : "",
				placeholder: "—",
				attr: { inputmode: "numeric" },
			});
			repsInput.addEventListener("change", (e) => {
				if (!this.state) return;
				const val = parseInt((e.target as HTMLInputElement).value, 10);
				this.state.exercises[exIdx].sets[sIdx].reps = isNaN(val) ? undefined : val;
				this.persistState();
			});
		}

		const checkBtn = row.createEl("button", {
			cls: `pulse-workout-check ${set.completed ? "pulse-workout-check-done" : ""}`,
		});
		setIcon(checkBtn, "check");
		checkBtn.addEventListener("click", () => {
			if (!this.state) return;
			this.state.exercises[exIdx].sets[sIdx].completed = !this.state.exercises[exIdx].sets[sIdx].completed;
			this.persistState();
			if (this.state.exercises[exIdx].sets[sIdx].completed) {
				row.addClass("pulse-workout-set-completed");
				checkBtn.addClass("pulse-workout-check-done");
				this.startRestTimer(restTimerContainer);
			} else {
				row.removeClass("pulse-workout-set-completed");
				checkBtn.removeClass("pulse-workout-check-done");
			}
		});
	}

	// --------------- Rest Timer ---------------

	private startRestTimer(container: HTMLElement): void {
		if (this.restTimerInterval) clearInterval(this.restTimerInterval);
		container.style.display = "flex";
		container.empty();

		const seconds = this.plugin.settings.defaultRestSeconds;
		this.restEndTime = Date.now() + seconds * 1000;

		const timerDisplay = container.createSpan({ cls: "pulse-workout-rest-display" });
		const skipBtn = container.createEl("button", {
			text: "Skip",
			cls: "pulse-workout-btn pulse-workout-btn-small",
		});
		skipBtn.addEventListener("click", () => {
			if (this.restTimerInterval) clearInterval(this.restTimerInterval);
			this.restTimerInterval = null;
			container.style.display = "none";
		});

		const update = () => {
			const remaining = Math.max(0, Math.ceil(((this.restEndTime ?? 0) - Date.now()) / 1000));
			const mins = Math.floor(remaining / 60);
			const secs = remaining % 60;
			timerDisplay.textContent = `Rest: ${mins}:${secs.toString().padStart(2, "0")}`;
			if (remaining <= 0) {
				if (this.restTimerInterval) clearInterval(this.restTimerInterval);
				this.restTimerInterval = null;
				container.style.display = "none";
			}
		};
		update();
		this.restTimerInterval = window.setInterval(update, 250);
	}

	// --------------- Save for Later ---------------

	private async saveForLater(): Promise<void> {
		if (!this.state || !this.container) return;

		const dm = this.plugin.workoutDataManager;

		// Build exercise list with all sets (completed or not — preserve the plan)
		const sessionExercises: SessionExercise[] = this.state.exercises.map((ex, i) => ({
			exercisePath: ex.exercisePath,
			order: i + 1,
			sets: ex.sets.map(s => ({
				set: s.set,
				weight: s.weight,
				reps: s.reps,
				duration: s.duration,
				distance: s.distance,
				note: s.note,
			})),
		}));

		const programDay = this.state.programDayName
			? { name: this.state.programDayName, exercises: [] as import("./types").ProgramExercise[] }
			: undefined;

		if (this.state.sessionPath) {
			// Update the existing saved session
			const session = await dm.getSession(this.state.sessionPath);
			if (session) {
				session.frontmatter.startTime = new Date(this.state.startTime).toISOString();
				if (this.state.bodyweight) session.frontmatter.bodyweight = this.state.bodyweight;
				session.session.exercises = sessionExercises;
				// No duration = not finished
				session.frontmatter.duration = undefined;
				await dm.saveSessionDraft(this.state.sessionPath, session);
				new Notice("Workout saved — resume any time");
			}
		} else {
			// Create a new session note (without duration = incomplete)
			const file = await dm.createSession(programDay, this.state.programName);
			const session = await dm.getSession(file.path);
			if (session) {
				session.frontmatter.startTime = new Date(this.state.startTime).toISOString();
				if (this.state.bodyweight) session.frontmatter.bodyweight = this.state.bodyweight;
				session.session.exercises = sessionExercises;
				await dm.saveSessionDraft(file.path, session);
				this.state.sessionPath = file.path;
				this.persistState();
				new Notice("Workout saved — resume any time");
			}
		}

		this.clearPersistedState();
		this.state = null;
		if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
		if (this.restTimerInterval) { clearInterval(this.restTimerInterval); this.restTimerInterval = null; }

		this.renderIdle();
	}

	// --------------- Finish Workout ---------------

	private async finishWorkout(): Promise<void> {
		if (!this.state || !this.container) return;

		const dm = this.plugin.workoutDataManager;
		const elapsed = Math.round((Date.now() - this.state.startTime) / 60000);

		const sessionExercises: SessionExercise[] = this.state.exercises
			.filter(ex => ex.sets.some(s => s.completed))
			.map((ex, i) => ({
				exercisePath: ex.exercisePath,
				order: i + 1,
				sets: ex.sets.filter(s => s.completed).map(s => ({
					set: s.set,
					weight: s.weight,
					reps: s.reps,
					duration: s.duration,
					distance: s.distance,
					note: s.note,
				})),
			}));

		if (this.state.sessionPath) {
			// Update the saved session rather than creating a new one
			const session = await dm.getSession(this.state.sessionPath);
			if (session) {
				session.frontmatter.duration = elapsed;
				session.frontmatter.startTime = new Date(this.state.startTime).toISOString();
				if (this.state.bodyweight) session.frontmatter.bodyweight = this.state.bodyweight;
				session.session.exercises = sessionExercises;
				await dm.saveSession(this.state.sessionPath, session);
			}
		} else {
			const programDay = this.state.programDayName
				? { name: this.state.programDayName, exercises: [] as import("./types").ProgramExercise[] }
				: undefined;

			const file = await dm.createSession(programDay, this.state.programName);
			const session = await dm.getSession(file.path);
			if (session) {
				session.frontmatter.duration = elapsed;
				session.frontmatter.startTime = new Date(this.state.startTime).toISOString();
				if (this.state.bodyweight) session.frontmatter.bodyweight = this.state.bodyweight;
				session.session.exercises = sessionExercises;
				await dm.saveSession(file.path, session);
			}
		}

		// Check for new PRs
		const newPRs: string[] = [];
		for (const ex of sessionExercises) {
			const note = await dm.getExercise(ex.exercisePath);
			if (!note) continue;
			if (isCardioMovement(note.frontmatter.movement)) continue;
			const pr = await dm.getPersonalRecord(ex.exercisePath);
			if (!pr) continue;
			const maxInSession = Math.max(...ex.sets.filter(s => s.weight != null).map(s => s.weight!), 0);
			if (maxInSession >= pr.weight) {
				newPRs.push(note.frontmatter.name);
			}
		}

		this.clearPersistedState();
		this.state = null;
		if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
		if (this.restTimerInterval) { clearInterval(this.restTimerInterval); this.restTimerInterval = null; }

		this.renderComplete(elapsed, sessionExercises, newPRs);
	}

	private renderComplete(duration: number, exercises: SessionExercise[], newPRs: string[]): void {
		if (!this.container) return;
		this.container.empty();

		const complete = this.container.createDiv({ cls: "pulse-workout-complete" });
		complete.createEl("h2", { text: "Workout Complete!" });

		const stats = complete.createDiv({ cls: "pulse-workout-complete-stats" });

		const durStat = stats.createDiv({ cls: "pulse-workout-stat" });
		durStat.createSpan({ text: String(duration), cls: "pulse-workout-stat-value" });
		durStat.createSpan({ text: "minutes", cls: "pulse-workout-stat-label" });

		const totalVolume = exercises.reduce((sum, ex) =>
			sum + ex.sets.reduce((s, set) => s + ((set.weight ?? 0) * (set.reps ?? 0)), 0), 0);
		const volStat = stats.createDiv({ cls: "pulse-workout-stat" });
		volStat.createSpan({ text: totalVolume.toLocaleString(), cls: "pulse-workout-stat-value" });
		volStat.createSpan({ text: `${this.plugin.settings.weightUnit} volume`, cls: "pulse-workout-stat-label" });

		const exStat = stats.createDiv({ cls: "pulse-workout-stat" });
		exStat.createSpan({ text: String(exercises.length), cls: "pulse-workout-stat-value" });
		exStat.createSpan({ text: "exercises", cls: "pulse-workout-stat-label" });

		if (newPRs.length > 0) {
			const prSection = complete.createDiv({ cls: "pulse-workout-new-prs" });
			prSection.createEl("h3", { text: "New PRs!" });
			for (const name of newPRs) {
				prSection.createDiv({ text: name, cls: "pulse-workout-pr-item" });
			}
		}

		const doneBtn = complete.createEl("button", {
			text: "Done",
			cls: "pulse-workout-btn pulse-workout-btn-primary",
		});
		doneBtn.addEventListener("click", () => this.renderIdle());
	}

	// --------------- Helpers ---------------

	private updateElapsedTimer(el: HTMLElement): void {
		if (!this.state) return;
		const elapsed = Math.floor((Date.now() - this.state.startTime) / 1000);
		const hrs = Math.floor(elapsed / 3600);
		const mins = Math.floor((elapsed % 3600) / 60);
		const secs = elapsed % 60;
		el.textContent = hrs > 0
			? `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
			: `${mins}:${secs.toString().padStart(2, "0")}`;
	}

	private async showProgramPicker(): Promise<void> {
		const dm = this.plugin.workoutDataManager;
		const programs = await dm.getAllPrograms();
		if (!this.container) return;

		if (programs.length === 0) {
			new Notice("No programs found. Create a program note in " + this.plugin.settings.programsFolder);
			return;
		}

		this.container.empty();
		const picker = this.container.createDiv({ cls: "pulse-workout-program-picker" });
		picker.createEl("h3", { text: "Choose a Program" });

		for (const program of programs) {
			const card = picker.createDiv({ cls: "pulse-workout-program-card" });
			card.createEl("h4", { text: program.name });
			card.createEl("p", { text: `${program.days.length} days · ${program.schedule.join(", ")}`, cls: "pulse-workout-muted" });

			for (const day of program.days) {
				const dayBtn = card.createEl("button", {
					text: day.name,
					cls: "pulse-workout-btn pulse-workout-btn-secondary",
				});
				dayBtn.addEventListener("click", () => this.startWorkout(day, program.name));
			}
		}

		const backBtn = picker.createEl("button", {
			text: "Back",
			cls: "pulse-workout-btn pulse-workout-btn-link",
		});
		backBtn.addEventListener("click", () => this.renderIdle());
	}

	private async showAddExercise(): Promise<void> {
		if (!this.state || !this.container) return;
		const dm = this.plugin.workoutDataManager;
		const exercises = await dm.getAllExercises();

		const overlay = this.container.createDiv({ cls: "pulse-workout-overlay" });
		const picker = overlay.createDiv({ cls: "pulse-workout-exercise-picker" });
		picker.createEl("h3", { text: "Add Exercise" });

		const searchInput = picker.createEl("input", {
			type: "text",
			cls: "pulse-workout-search",
			placeholder: "Search exercises...",
		});

		const list = picker.createDiv({ cls: "pulse-workout-exercise-pick-list" });

		const renderList = (filter: string) => {
			list.empty();
			const filtered = exercises.filter(e =>
				e.frontmatter.name.toLowerCase().includes(filter.toLowerCase())
			);
			if (filtered.length === 0) {
				list.createEl("p", { text: "No exercises found.", cls: "pulse-workout-muted" });
			}
			for (const ex of filtered) {
				const item = list.createDiv({ cls: "pulse-workout-exercise-pick-item" });
				item.createSpan({ text: ex.frontmatter.name });
				item.createSpan({ text: ex.frontmatter.movement, cls: "pulse-workout-muted" });
				item.addEventListener("click", async () => {
					if (!this.state) return;
					const movement = ex.frontmatter.movement ?? "";
					const distanceUnit = parseDistanceUnit(ex.frontmatter["distance-unit"]) ?? defaultDistanceUnit();
					const cardio = isCardioMovement(movement);

					let previousBest: { weight: number; reps: number } | undefined;
					if (!cardio && ex.log.length > 0) {
						const lastSets = ex.log[0].sets;
						const best = lastSets.reduce<SetEntry | null>((b, s) =>
							s.weight != null && (!b || (s.weight ?? 0) > (b.weight ?? 0)) ? s : b, null);
						if (best?.weight != null && best?.reps != null) previousBest = { weight: best.weight, reps: best.reps };
					}

					this.state.exercises.push({
						exercisePath: ex.file.path,
						exerciseName: ex.frontmatter.name,
						movement,
						distanceUnit,
						sets: cardio
							? [{ set: 1, duration: undefined, distance: undefined, completed: false }]
							: [{ set: 1, weight: previousBest?.weight, reps: undefined, completed: false }],
						previousBest,
						previousCardio: cardio ? previousCardioFromLog(ex) : undefined,
					});
					this.persistState();
					overlay.remove();
					this.renderActiveWorkout();
				});
			}
		};

		renderList("");
		searchInput.addEventListener("input", (e) => renderList((e.target as HTMLInputElement).value));

		const closeBtn = picker.createEl("button", { text: "Cancel", cls: "pulse-workout-btn pulse-workout-btn-link" });
		closeBtn.addEventListener("click", () => overlay.remove());
	}

	private persistState(): void {
		if (this.state) {
			try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch { /* quota */ }
		}
	}

	private loadPersistedState(): void {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as ActiveWorkoutState;
			if (parsed?.exercises?.length) {
				for (const ex of parsed.exercises) {
					if (ex.movement === undefined) ex.movement = "";
					if (ex.distanceUnit === undefined) ex.distanceUnit = defaultDistanceUnit();
				}
			}
			this.state = parsed;
		} catch { /* corrupt */ }
	}

	private clearPersistedState(): void {
		localStorage.removeItem(STORAGE_KEY);
	}
}
