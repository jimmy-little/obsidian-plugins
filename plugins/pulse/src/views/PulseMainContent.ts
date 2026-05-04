import { setIcon, TFile, normalizePath } from "obsidian";
import { openNotePropertiesModal } from "@obsidian-suite/core";
import type PulsePlugin from "../main";
import type { PulseView } from "./PulseView";
import { HistoryTab } from "../workout/HistoryTab";
import { StatsTab } from "../workout/StatsTab";
import { BodyCompTab } from "../workout/BodyCompTab";
import { parseFrontmatter } from "../import/parsers";
import { durationSecondsFromWorkoutFrontmatter } from "../import/workoutDedup";
import { renderSessionWorkoutBody } from "./renderSessionWorkoutBody";
import type { ExerciseNote, ExerciseLogEntry } from "../workout/types";
import { isStandaloneSession } from "../workout/types";
import { renderProgressChart } from "../workout/charts";
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
				await this.renderHome(container);
				break;
			case "history":
				await this.renderHistory(container);
				break;
			case "stats":
				await this.renderStats(container);
				break;
			case "body":
				await this.renderBody(container);
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
				await this.renderHistory(container);
		}
	}

	// ── Home (import-focused; legacy URI screen=today) ──

	private async renderHome(container: HTMLElement): Promise<void> {
		const header = container.createDiv({ cls: "pulse-pm__main-head" });
		header.createEl("h2", { text: "Pulse", cls: "pulse-pm__main-title" });

		const body = container.createDiv({ cls: "pulse-pm__main-body" });
		body.createEl("p", {
			text: "Log workouts in your preferred app (with Apple Watch if you like). Pulse imports exports into this vault and shows them in History and Stats.",
		});
		const actions = body.createDiv({ cls: "pulse-pm__home-actions" });
		const scanBtn = actions.createEl("button", {
			text: "Scan for Health & workout imports",
			cls: "pulse-workout-btn pulse-workout-btn-primary",
		});
		scanBtn.addEventListener("click", () => {
			void this.plugin.importManager.scanAndImport();
		});
		const links = body.createDiv({ cls: "pulse-pm__home-links" });
		const h = links.createEl("button", {
			text: "Open History",
			cls: "pulse-workout-btn pulse-workout-btn-link",
		});
		h.addEventListener("click", () => this.view.navigate("history"));
		const s = links.createEl("button", {
			text: "Open Stats",
			cls: "pulse-workout-btn pulse-workout-btn-link",
		});
		s.addEventListener("click", () => this.view.navigate("stats"));
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

	// ── Body composition ──

	private async renderBody(container: HTMLElement): Promise<void> {
		const content = container.createDiv({ cls: "pulse-pm__main-body" });
		this.bodyCompTab = new BodyCompTab(this.plugin);
		await this.bodyCompTab.render(content);
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

		const header = container.createDiv({ cls: "pulse-pm__main-head" });
		header.createEl("h2", { text: fm.name, cls: "pulse-pm__main-title" });

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

	private resolveWorkoutBannerSrc(bannerRaw: unknown): string | null {
		const s = String(bannerRaw ?? "").trim();
		if (!s) return null;
		const m = s.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
		if (!m) return null;
		const inner = normalizePath(m[1]!.trim());
		const f = this.plugin.app.vault.getAbstractFileByPath(inner);
		if (f instanceof TFile) {
			return this.plugin.app.vault.getResourcePath(f);
		}
		return null;
	}

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
		const bannerSrc = this.resolveWorkoutBannerSrc(rawFm.banner);
		if (bannerSrc) {
			const wrap = container.createDiv({
				cls: "pulse-session-banner pulse-session-banner--has-image",
			});
			wrap.createEl("img", {
				cls: "pulse-session-banner__img",
				attr: { src: bannerSrc, alt: "" },
			});
			wrap.createDiv({ cls: "pulse-session-banner__scrim" });
			const actions = wrap.createDiv({ cls: "pulse-session-banner__actions" });
			const row = actions.createDiv({ cls: "pulse-session-banner-btn-row" });
			const mkBannerBtn = (icon: string, label: string, onClick: () => void) => {
				const b = row.createEl("button", {
					type: "button",
					cls: "pulse-session-banner-btn pulse-session-banner-btn--icon-only",
					attr: { "aria-label": label, title: label },
				});
				const iconEl = b.createSpan({ cls: "pulse-session-banner-btn__icon" });
				setIcon(iconEl, icon);
				b.addEventListener("click", onClick);
			};
			mkBannerBtn("file-input", "Open note", () => {
				void this.plugin.app.workspace.getLeaf("tab").openFile(session.file);
			});
			mkBannerBtn("file-json", "Edit properties", () => {
				openNotePropertiesModal(this.plugin.app, session.file, { displayTitleField: "name" });
			});
		}

		const dayName = session.frontmatter.programDay ?? "Workout";
		const header = container.createDiv({ cls: "pulse-pm__main-head" });
		const title =
			this.view.mode === "workout-edit"
				? `${session.frontmatter.date} — ${dayName} (read-only)`
				: `${session.frontmatter.date} — ${dayName}`;
		header.createEl("h2", {
			text: title,
			cls: "pulse-pm__main-title",
		});

		const meta = header.createDiv({ cls: "pulse-pm__main-meta" });
		const durSec = durationSecondsFromWorkoutFrontmatter(rawFm as Record<string, unknown>);
		if (durSec > 0) {
			meta.createSpan({ text: `${Math.max(1, Math.round(durSec / 60))} min`, cls: "pulse-pm__tag" });
		} else if (session.frontmatter.duration != null) {
			meta.createSpan({ text: `${session.frontmatter.duration} min`, cls: "pulse-pm__tag" });
		}
		if (session.frontmatter.program) {
			meta.createSpan({ text: session.frontmatter.program, cls: "pulse-pm__tag" });
		}
		if (session.frontmatter.startTime) {
			meta.createSpan({ text: session.frontmatter.startTime, cls: "pulse-pm__tag" });
		}
		if (session.frontmatter.importedActivityType) {
			meta.createSpan({ text: session.frontmatter.importedActivityType, cls: "pulse-pm__tag" });
		}

		const body = container.createDiv({ cls: "pulse-pm__main-body" });
		await renderSessionWorkoutBody(this.plugin, body, session, path);
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
		this.bodyCompTab = null;
		if (this.chart) { this.chart.destroy(); this.chart = null; }
		this.container = null;
	}
}
