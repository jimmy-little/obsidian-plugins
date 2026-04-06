import { Component, MarkdownRenderer, setIcon } from "obsidian";
import type PulsePlugin from "../main";
import type { ProgramNote, SessionNote } from "./types";
import {
	buildCalendarGridCells,
	buildSessionsByDate,
	computePlannedForMonth,
	DAY_ABBREVS,
	formatMonthTitle,
	toIsoDateLocal,
} from "./historyCalendar";

export class HistoryTab {
	private plugin: PulsePlugin;
	private container: HTMLElement | null = null;
	/** Persist across session detail → back within the same History tab instance */
	private calendarYear: number | null = null;
	private calendarMonth: number | null = null;

	constructor(plugin: PulsePlugin) {
		this.plugin = plugin;
	}

	async render(container: HTMLElement): Promise<void> {
		this.container = container;
		container.empty();
		container.createDiv({ cls: "pulse-workout-loading", text: "Loading sessions..." });

		const dm = this.plugin.workoutDataManager;
		const [sessions, programs] = await Promise.all([
			dm.getAllSessions(),
			dm.getAllPrograms(),
		]);

		if (this.calendarYear == null || this.calendarMonth == null) {
			const n = new Date();
			this.calendarYear = n.getFullYear();
			this.calendarMonth = n.getMonth();
		}

		container.empty();
		this.renderLoaded(container, sessions, programs);
	}

	private renderLoaded(
		container: HTMLElement,
		sessions: SessionNote[],
		programs: ProgramNote[]
	): void {
		const wrapper = container.createDiv({ cls: "pulse-workout-history-wrap" });

		this.renderCalendar(wrapper, sessions, programs);

		const logSection = wrapper.createDiv({ cls: "pulse-workout-history-log" });
		logSection.createEl("h3", { text: "Session log", cls: "pulse-workout-history-log-title" });

		const list = logSection.createDiv({ cls: "pulse-workout-history" });

		if (sessions.length === 0) {
			list.createEl("p", {
				text: "No sessions yet. Start a workout from Today, or import from Health.",
				cls: "pulse-workout-muted",
			});
			return;
		}

		const sorted = [...sessions].sort((a, b) =>
			b.frontmatter.date.localeCompare(a.frontmatter.date)
		);

		for (const session of sorted) {
			const row = list.createDiv({ cls: "pulse-workout-history-row" });
			row.addEventListener("click", () => void this.showSessionDetail(session));

			const info = row.createDiv({ cls: "pulse-workout-history-info" });
			info.createSpan({ text: session.frontmatter.date, cls: "pulse-workout-history-date" });
			const dayName = session.frontmatter.programDay ?? "Workout";
			info.createSpan({ text: dayName, cls: "pulse-workout-history-name" });

			const meta = row.createDiv({ cls: "pulse-workout-history-meta" });
			if (session.frontmatter.duration) {
				meta.createSpan({ text: `${session.frontmatter.duration} min` });
			}
			const volume = this.computeVolume(session);
			if (volume > 0) {
				meta.createSpan({ text: `${volume.toLocaleString()} ${this.plugin.settings.weightUnit}` });
			}
		}
	}

	private renderCalendar(
		parent: HTMLElement,
		sessions: SessionNote[],
		programs: ProgramNote[]
	): void {
		const y = this.calendarYear!;
		const m = this.calendarMonth!;

		const section = parent.createDiv({ cls: "pulse-cal" });
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

		const shiftMonth = async (delta: number): Promise<void> => {
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
			this.container.empty();
			const dm = this.plugin.workoutDataManager;
			const [freshSessions, freshPrograms] = await Promise.all([
				dm.getAllSessions(),
				dm.getAllPrograms(),
			]);
			this.renderLoaded(this.container, freshSessions, freshPrograms);
		};

		prevBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void shiftMonth(-1);
		});
		nextBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void shiftMonth(1);
		});

		const planned = computePlannedForMonth(y, m, programs, sessions);
		const byDate = buildSessionsByDate(sessions);

		const grid = section.createDiv({ cls: "pulse-cal__grid" });
		const weekdays = grid.createDiv({ cls: "pulse-cal__weekdays" });
		for (const d of DAY_ABBREVS) {
			weekdays.createDiv({ cls: "pulse-cal__weekday", text: d });
		}

		const cells = grid.createDiv({ cls: "pulse-cal__cells" });
		const dayCells = buildCalendarGridCells(y, m);

		for (const dayOrNull of dayCells) {
			const cell = cells.createDiv({ cls: "pulse-cal__cell" });
			if (dayOrNull == null) {
				cell.addClass("pulse-cal__cell--empty");
				continue;
			}

			const dateStr = toIsoDateLocal(y, m, dayOrNull);
			cell.createDiv({ cls: "pulse-cal__day-num", text: String(dayOrNull) });

			const daySessions = byDate.get(dateStr) ?? [];
			const dayPlanned = planned.get(dateStr) ?? [];

			const marks = cell.createDiv({ cls: "pulse-cal__marks" });

			for (const s of daySessions) {
				const label = s.frontmatter.programDay ?? "Workout";
				const chip = marks.createDiv({ cls: "pulse-cal__chip pulse-cal__chip--done" });
				chip.setAttribute("title", `${s.file.basename}`);
				chip.setText(label);
				chip.addEventListener("click", (e) => {
					e.stopPropagation();
					void this.showSessionDetail(s);
				});
			}

			for (const p of dayPlanned) {
				const chip = marks.createDiv({ cls: "pulse-cal__chip pulse-cal__chip--planned" });
				chip.setAttribute("title", `${p.programName}: ${p.dayName}`);
				chip.setText(p.dayName);
			}

			if (daySessions.length === 0 && dayPlanned.length === 0) {
				marks.addClass("pulse-cal__marks--empty");
			}
		}

		section.createDiv({
			cls: "pulse-cal__hint pulse-workout-muted",
			text: "Filled chips are logged workouts; outlined chips are planned program days. Drag-and-drop between days is planned.",
		});
	}

	private async showSessionDetail(session: SessionNote): Promise<void> {
		if (!this.container) return;
		this.container.empty();

		const detail = this.container.createDiv({ cls: "pulse-workout-session-detail" });

		const header = detail.createDiv({ cls: "pulse-workout-detail-header" });
		const backBtn = header.createEl("button", { text: "← Back", cls: "pulse-workout-btn pulse-workout-btn-link" });
		backBtn.addEventListener("click", () => void this.render(this.container!));

		header.createEl("h3", {
			text: `${session.frontmatter.date} — ${session.frontmatter.programDay ?? "Workout"}`,
		});

		if (session.frontmatter.duration) {
			detail.createEl("p", { text: `Duration: ${session.frontmatter.duration} min`, cls: "pulse-workout-muted" });
		}

		if (session.session.exercises.length === 0) {
			detail.createEl("p", { text: "No exercises recorded.", cls: "pulse-workout-muted" });
			return;
		}

		const mdComp = new Component();
		this.plugin.addChild(mdComp);

		for (const exercise of session.session.exercises) {
			const exDiv = detail.createDiv({ cls: "pulse-workout-detail-exercise" });
			const h4 = exDiv.createEl("h4");
			const wikiPath = this.plugin.workoutDataManager
				.resolveExerciseVaultPath(exercise.exercisePath)
				.replace(/\.md$/i, "");
			await MarkdownRenderer.render(this.plugin.app, `[[${wikiPath}]]`, h4, session.file.path, mdComp);

			const table = exDiv.createEl("table", { cls: "pulse-workout-detail-table" });
			const thead = table.createEl("thead");
			const headerRow = thead.createEl("tr");
			["Set", "Weight", "Reps", "Note"].forEach(h => headerRow.createEl("th", { text: h }));

			const tbody = table.createEl("tbody");
			for (const set of exercise.sets) {
				const row = tbody.createEl("tr");
				row.createEl("td", { text: String(set.set) });
				row.createEl("td", { text: set.weight != null ? `${set.weight} ${this.plugin.settings.weightUnit}` : "—" });
				row.createEl("td", { text: set.reps != null ? String(set.reps) : "—" });
				row.createEl("td", { text: set.note ?? "" });
			}
		}
	}

	private computeVolume(session: SessionNote): number {
		return session.session.exercises.reduce((total, ex) =>
			total + ex.sets.reduce((sum, s) => sum + ((s.weight ?? 0) * (s.reps ?? 0)), 0), 0);
	}

	destroy(): void {
		this.container = null;
		this.calendarYear = null;
		this.calendarMonth = null;
	}
}
