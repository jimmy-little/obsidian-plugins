import { setIcon } from "obsidian";
import { openNotePropertiesModal } from "@obsidian-suite/core";
import type PulsePlugin from "../main";
import type { PulseView } from "./PulseView";
import { HistoryTab } from "../workout/HistoryTab";
import { StatsTab } from "../workout/StatsTab";
import { BodyCompTab } from "../workout/BodyCompTab";
import { NutritionTab } from "../nutrition/NutritionTab";
import { parseFrontmatter } from "../import/parsers";
import { renderSessionWorkoutBody } from "./renderSessionWorkoutBody";
import { renderWorkoutSessionHeader } from "./renderWorkoutSessionHeader";
import type { ExerciseNote, ExerciseLogEntry } from "../workout/types";
import { isStandaloneSession } from "../workout/types";
import { createMainHeadWithRefresh, appendScanRefreshButton } from "./scanRefreshButton";
import {
	estimate1RM, daysAgo, relativeDate, bestSet, totalVolumeForEntry,
	buildProgressSvg, buildActivityHeatmap,
} from "../workout/renderers";

export class PulseMainContent {
	private plugin: PulsePlugin;
	private view: PulseView;
	private container: HTMLElement | null = null;

	private historyTab: HistoryTab | null = null;
	private statsTab: StatsTab | null = null;
	private bodyCompTab: BodyCompTab | null = null;
	private nutritionTab: NutritionTab | null = null;
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
			case "history":
				await this.renderHome(container);
				break;
			case "stats":
				await this.renderStats(container);
				break;
			case "body":
				await this.renderBody(container);
				break;
			case "nutrition":
				await this.renderNutrition(container);
				break;
			case "exercise":
				await this.renderExercise(container);
				break;
			case "session":
			case "workout-edit":
				await this.renderSession(container);
				break;
			case "program":
				await this.renderProgram(container);
				break;
			default:
				await this.renderHome(container);
		}
	}

	// ── Home (import + workout history) ──

	private async renderHome(container: HTMLElement): Promise<void> {
		createMainHeadWithRefresh(container, "Pulse", this.plugin);

		const content = container.createDiv({ cls: "pulse-pm__main-body" });

		const entries = this.plugin.workoutDataManager.getAllWorkoutListEntries();
		const enriched = await this.plugin.workoutDataManager.enrichWorkoutListEntries(entries);
		this.historyTab = new HistoryTab(this.plugin, this.view);
		this.historyTab.render(content, enriched);
	}

	// ── Stats ──

	private async renderStats(container: HTMLElement): Promise<void> {
		createMainHeadWithRefresh(container, "Stats", this.plugin);

		const content = container.createDiv({ cls: "pulse-pm__main-body" });
		this.statsTab = new StatsTab(this.plugin);
		await this.statsTab.render(content);
	}

	// ── Body composition ──

	private async renderBody(container: HTMLElement): Promise<void> {
		const content = container.createDiv({ cls: "pulse-pm__main-body" });
		this.bodyCompTab = new BodyCompTab(this.plugin);
		await this.bodyCompTab.render(content);
	}

	private async renderNutrition(container: HTMLElement): Promise<void> {
		createMainHeadWithRefresh(container, "Nutrition", this.plugin);

		const content = container.createDiv({ cls: "pulse-pm__main-body" });
		this.nutritionTab = new NutritionTab(this.plugin, () => void this.view.refresh());
		await this.nutritionTab.render(content);
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

		const header = container.createDiv({ cls: "pulse-pm__main-head pulse-exercise-head" });
		const titleRow = header.createDiv({ cls: "pulse-pm__main-head-row" });
		titleRow.createEl("h2", { text: fm.name, cls: "pulse-pm__main-title" });

		const actions = titleRow.createDiv({ cls: "pulse-pm__main-head-actions" });
		const mkExerciseHeadBtn = (icon: string, label: string, onClick: () => void) => {
			const btn = actions.createEl("button", {
				type: "button",
				cls: "pulse-pm__head-btn pulse-pm__head-btn--icon-only clickable-icon",
				attr: { "aria-label": label, title: label },
			});
			setIcon(btn.createSpan({ cls: "pulse-pm__head-btn__icon" }), icon);
			btn.addEventListener("click", onClick);
		};

		mkExerciseHeadBtn("file-json", "Edit properties (YAML)", () => {
			const modal = openNotePropertiesModal(this.plugin.app, exercise.file, {
				displayTitleField: "name",
			});
			const prevClose = modal.onClose.bind(modal);
			modal.onClose = () => {
				prevClose();
				void this.view.refreshMain();
			};
		});

		mkExerciseHeadBtn("square-arrow-out-up-right", "Open note", () => {
			void this.plugin.app.workspace.getLeaf("tab").openFile(exercise.file);
		});

		appendScanRefreshButton(this.plugin, actions);

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

		// ── E1RM progress chart (SVG) — always shown; empty state inside SVG when no weighted sets
		const weightEntries = entries.filter(e => e.sets.some(s => s.weight != null && s.reps != null && s.weight! > 0));
		const chartSection = body.createDiv({ cls: "pulse-pm__section" });
		chartSection.createEl("h3", { text: "Estimated 1RM Progress", cls: "pulse-pm__section-title" });
		chartSection.appendChild(buildProgressSvg(weightEntries, 600, 160));

		// ── Activity heatmap (same grid layout as Stats / Orbit-style heatmaps) ──
		if (entries.length > 0) {
			const activitySection = body.createDiv({ cls: "pulse-pm__section" });
			activitySection.createEl("h3", { text: "Activity", cls: "pulse-pm__section-title" });
			activitySection.appendChild(buildActivityHeatmap(entries));
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
				const sess = await this.plugin.workoutDataManager.getSessionForDisplay(entry.sessionPath!);
				if (sess && isStandaloneSession(sess)) {
					this.view.navigate("session", entry.sessionPath);
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
		const session = await dm.getSessionForDisplay(path);
		if (!session) {
			container.createEl("p", { text: "Session or workout note not found.", cls: "pulse-workout-muted" });
			return;
		}

		const raw = await this.plugin.app.vault.read(session.file);
		const { frontmatter: rawFm } = parseFrontmatter(raw);

		renderWorkoutSessionHeader(this.plugin, container, session, rawFm as Record<string, unknown>, {
			onRefresh: () => this.view.refreshMain(),
			onGoHome: () => this.view.navigate("today"),
			onRenamed: () => {
				this.plugin.workoutDataManager.invalidateWorkoutListCache();
				void this.view.refreshSidebar();
				void this.view.refreshMain();
			},
			onDeleted: () => {
				this.view.navigate("today");
			},
		});

		const body = container.createDiv({ cls: "pulse-pm__main-body" });
		await renderSessionWorkoutBody(this.plugin, body, session, path, rawFm as Record<string, unknown>);
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
		const titleRow = header.createDiv({ cls: "pulse-pm__main-head-row" });
		titleRow.createEl("h2", { text: program.name, cls: "pulse-pm__main-title" });
		const programActions = titleRow.createDiv({ cls: "pulse-pm__main-head-actions" });
		appendScanRefreshButton(this.plugin, programActions);

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
				link.addEventListener("click", () =>
					this.view.navigate("exercise", dm.resolveExerciseVaultPath(ex.exercisePath)));

				row.createEl("td", { text: String(ex.sets) });
				row.createEl("td", {
					text: ex.reps ? String(ex.reps) : ex.duration ? `${ex.duration}s` : "—",
				});
			}
		}
	}

	destroy(): void {
		this.historyTab?.destroy();
		this.statsTab?.destroy();
		this.bodyCompTab?.destroy();
		this.nutritionTab?.destroy();
		this.bodyCompTab = null;
		this.nutritionTab = null;
		if (this.chart) { this.chart.destroy(); this.chart = null; }
		this.container = null;
	}
}
