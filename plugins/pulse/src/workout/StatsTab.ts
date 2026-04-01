import type PulsePlugin from "../main";
import type { SessionNote, ExerciseNote } from "./types";
import { renderVolumeChart, renderCategoryChart } from "./charts";

export class StatsTab {
	private plugin: PulsePlugin;
	private container: HTMLElement | null = null;
	private charts: { destroy(): void }[] = [];

	constructor(plugin: PulsePlugin) {
		this.plugin = plugin;
	}

	async render(container: HTMLElement): Promise<void> {
		this.container = container;
		this.destroyCharts();
		container.empty();
		container.createDiv({ cls: "pulse-workout-loading", text: "Loading stats..." });

		const dm = this.plugin.workoutDataManager;
		const [sessions, exercises] = await Promise.all([
			dm.getAllSessions(),
			dm.getAllExercises(),
		]);

		container.empty();
		const wrapper = container.createDiv({ cls: "pulse-workout-stats" });

		// Volume over time (last 12 weeks)
		await this.renderVolumeSection(wrapper, sessions);

		// Workout frequency heatmap
		this.renderHeatmap(wrapper, sessions);

		// PR Board
		this.renderPRBoard(wrapper, exercises);

		// Category breakdown
		await this.renderCategoryBreakdown(wrapper, sessions, exercises);
	}

	private async renderVolumeSection(parent: HTMLElement, sessions: SessionNote[]): Promise<void> {
		const section = parent.createDiv({ cls: "pulse-workout-stats-section" });
		section.createEl("h3", { text: "Weekly Volume" });

		const weeklyVolumes = this.computeWeeklyVolumes(sessions, 12);
		if (weeklyVolumes.length === 0) {
			section.createEl("p", { text: "No data yet.", cls: "pulse-workout-muted" });
			return;
		}

		const chartContainer = section.createDiv({ cls: "pulse-workout-chart-container" });
		const canvas = chartContainer.createEl("canvas");
		canvas.width = 500;
		canvas.height = 200;
		try {
			const chart = await renderVolumeChart(canvas, weeklyVolumes);
			this.charts.push(chart);
		} catch (e) {
			console.warn("Volume chart error:", e);
			chartContainer.createEl("p", { text: "Chart unavailable", cls: "pulse-workout-muted" });
		}
	}

	private renderHeatmap(parent: HTMLElement, sessions: SessionNote[]): void {
		const section = parent.createDiv({ cls: "pulse-workout-stats-section" });
		section.createEl("h3", { text: "Workout Frequency" });

		const dateSet = new Set(sessions.map(s => s.frontmatter.date));
		const today = new Date();
		const heatmap = section.createDiv({ cls: "pulse-workout-heatmap" });

		// Day labels
		const dayLabels = heatmap.createDiv({ cls: "pulse-workout-heatmap-labels" });
		["", "Mon", "", "Wed", "", "Fri", ""].forEach(d =>
			dayLabels.createDiv({ cls: "pulse-workout-heatmap-label", text: d })
		);

		const grid = heatmap.createDiv({ cls: "pulse-workout-heatmap-grid" });

		// 52 weeks
		for (let week = 51; week >= 0; week--) {
			const col = grid.createDiv({ cls: "pulse-workout-heatmap-col" });
			for (let day = 0; day < 7; day++) {
				const d = new Date(today);
				d.setDate(d.getDate() - (week * 7 + (today.getDay() - day)));
				const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
				const hasWorkout = dateSet.has(dateStr);
				const cell = col.createDiv({
					cls: `pulse-workout-heatmap-cell ${hasWorkout ? "pulse-workout-heatmap-active" : ""}`,
				});
				cell.setAttribute("title", dateStr);
			}
		}
	}

	private renderPRBoard(parent: HTMLElement, exercises: ExerciseNote[]): void {
		const section = parent.createDiv({ cls: "pulse-workout-stats-section" });
		section.createEl("h3", { text: "Personal Records" });

		const prs = exercises
			.filter(e => e.frontmatter["pr-weight"] != null)
			.sort((a, b) => {
				const dateA = a.frontmatter["pr-date"] ?? "";
				const dateB = b.frontmatter["pr-date"] ?? "";
				return dateB.localeCompare(dateA);
			});

		if (prs.length === 0) {
			section.createEl("p", { text: "No PRs yet.", cls: "pulse-workout-muted" });
			return;
		}

		const table = section.createEl("table", { cls: "pulse-workout-pr-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		["Exercise", "PR Weight", "Date"].forEach(h => headerRow.createEl("th", { text: h }));

		const tbody = table.createEl("tbody");
		for (const ex of prs) {
			const row = tbody.createEl("tr");
			row.createEl("td", { text: ex.frontmatter.name });
			row.createEl("td", { text: `${ex.frontmatter["pr-weight"]} ${ex.frontmatter.unit}` });
			row.createEl("td", { text: ex.frontmatter["pr-date"] ?? "—" });
		}
	}

	private async renderCategoryBreakdown(parent: HTMLElement, sessions: SessionNote[], exercises: ExerciseNote[]): Promise<void> {
		const section = parent.createDiv({ cls: "pulse-workout-stats-section" });
		section.createEl("h3", { text: "Volume by Movement" });

		const exerciseMap = new Map<string, ExerciseNote>();
		for (const ex of exercises) exerciseMap.set(ex.file.path, ex);

		const movementVolumes = new Map<string, number>();
		for (const session of sessions) {
			for (const ex of session.session.exercises) {
				const exercise = exerciseMap.get(ex.exercisePath);
				const movement = exercise?.frontmatter.movement ?? "Uncategorized";
				const volume = ex.sets.reduce((s, set) => s + ((set.weight ?? 0) * (set.reps ?? 0)), 0);
				movementVolumes.set(movement, (movementVolumes.get(movement) ?? 0) + volume);
			}
		}

		const categories = Array.from(movementVolumes.entries())
			.map(([name, volume]) => ({ name, volume }))
			.sort((a, b) => b.volume - a.volume);

		if (categories.length === 0) {
			section.createEl("p", { text: "No data yet.", cls: "pulse-workout-muted" });
			return;
		}

		const chartContainer = section.createDiv({ cls: "pulse-workout-chart-container pulse-workout-chart-small" });
		const canvas = chartContainer.createEl("canvas");
		canvas.width = 300;
		canvas.height = 200;
		try {
			const chart = await renderCategoryChart(canvas, categories);
			this.charts.push(chart);
		} catch (e) {
			console.warn("Category chart error:", e);
			chartContainer.createEl("p", { text: "Chart unavailable", cls: "pulse-workout-muted" });
		}
	}

	private computeWeeklyVolumes(sessions: SessionNote[], weeks: number): { week: string; volume: number }[] {
		const now = new Date();
		const results: { week: string; volume: number }[] = [];

		for (let w = weeks - 1; w >= 0; w--) {
			const weekStart = new Date(now);
			weekStart.setDate(weekStart.getDate() - weekStart.getDay() - w * 7);
			weekStart.setHours(0, 0, 0, 0);
			const weekEnd = new Date(weekStart);
			weekEnd.setDate(weekEnd.getDate() + 7);

			const weekStr = `${(weekStart.getMonth() + 1)}/${weekStart.getDate()}`;
			let volume = 0;

			for (const session of sessions) {
				const sessionDate = new Date(session.frontmatter.date + "T00:00:00");
				if (sessionDate >= weekStart && sessionDate < weekEnd) {
					for (const ex of session.session.exercises) {
						volume += ex.sets.reduce((s, set) => s + ((set.weight ?? 0) * (set.reps ?? 0)), 0);
					}
				}
			}

			results.push({ week: weekStr, volume });
		}

		return results;
	}

	private destroyCharts(): void {
		for (const chart of this.charts) chart.destroy();
		this.charts = [];
	}

	destroy(): void {
		this.destroyCharts();
		this.container = null;
	}
}
