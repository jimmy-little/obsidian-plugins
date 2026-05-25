import type PulsePlugin from "../main";
import { formatPulseImportAt } from "../formatImport";
import type { SessionNote, ExerciseNote } from "./types";
import { renderVolumeChart, renderRatioDoughnutChart } from "./charts";
import { createSuiteWorkoutHeatmap } from "./pulseHeatmap";
import { workoutDateFromFrontmatter } from "../import/workoutDedup";
import { relativeDate } from "./renderers";
import {
	aggregateBodyPartVolumes,
	aggregateWorkoutTypeCounts,
} from "../stats/statsAggregates";

const RECENT_PR_COUNT = 3;

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
			dm.getAllWorkoutSessions(),
			dm.getAllExercises(),
		]);

		container.empty();
		const wrapper = container.createDiv({ cls: "pulse-workout-stats" });

		await this.renderVolumeSection(wrapper, sessions);
		this.renderHeatmap(wrapper, sessions);
		this.renderRecentPRs(wrapper, exercises);
		await this.renderBreakdownCharts(wrapper, sessions, exercises);

		const foot = wrapper.createDiv({ cls: "pulse-stats__footer" });
		foot.createSpan({ cls: "pulse-stats__footer-label", text: "Last workout import: " });
		foot.createSpan({
			cls: "pulse-stats__footer-date",
			text: formatPulseImportAt(this.plugin.settings.lastWorkoutImportAt),
		});
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

		const counts = new Map<string, number>();
		for (const s of sessions) {
			const d = workoutDateFromFrontmatter(s.frontmatter as unknown as Record<string, unknown>);
			if (!d) continue;
			counts.set(d, (counts.get(d) ?? 0) + 1);
		}

		const heatmap = createSuiteWorkoutHeatmap(counts, {
			ariaLabel: "Workout sessions in the last year",
		});
		heatmap.addClass("pulse-workout-stats-heatmap");
		section.appendChild(heatmap);
	}

	private renderRecentPRs(parent: HTMLElement, exercises: ExerciseNote[]): void {
		const section = parent.createDiv({ cls: "pulse-workout-stats-section" });
		section.createEl("h3", { text: "Recent PRs" });

		const prs = exercises
			.filter((e) => e.frontmatter["pr-weight"] != null)
			.sort((a, b) => {
				const dateA = a.frontmatter["pr-date"] ?? "";
				const dateB = b.frontmatter["pr-date"] ?? "";
				return dateB.localeCompare(dateA);
			})
			.slice(0, RECENT_PR_COUNT);

		if (prs.length === 0) {
			section.createEl("p", { text: "No PRs yet.", cls: "pulse-workout-muted" });
			return;
		}

		const row = section.createDiv({ cls: "pulse-stats-pr-cards" });
		for (const ex of prs) {
			const date = ex.frontmatter["pr-date"] ?? "";
			const card = row.createDiv({ cls: "pulse-log-card pulse-log-card-accent pulse-stats-pr-card" });
			card.createDiv({ text: ex.frontmatter.name, cls: "pulse-log-card-label" });
			card.createDiv({
				text: `${ex.frontmatter["pr-weight"]} ${ex.frontmatter.unit}`,
				cls: "pulse-log-card-value",
			});
			card.createDiv({
				text: date ? relativeDate(date) : "—",
				cls: "pulse-log-card-sub",
			});
			if (date) {
				card.createDiv({ text: date, cls: "pulse-log-card-sub" });
			}
		}
	}

	private async renderBreakdownCharts(
		parent: HTMLElement,
		sessions: SessionNote[],
		exercises: ExerciseNote[],
	): Promise<void> {
		const section = parent.createDiv({ cls: "pulse-workout-stats-section" });
		section.createEl("h3", { text: "Training Mix" });

		const row = section.createDiv({ cls: "pulse-stats-donut-row" });

		const typeCounts = aggregateWorkoutTypeCounts(sessions);
		await this.renderDonutPanel(
			row,
			"Workout types",
			"By session count",
			typeCounts.map((t) => ({ label: t.name, value: t.count })),
		);

		const bodyPartVolumes = aggregateBodyPartVolumes(sessions, exercises);
		await this.renderDonutPanel(
			row,
			"Strength body parts",
			"By total volume",
			bodyPartVolumes.map((b) => ({ label: b.name, value: b.volume })),
		);
	}

	private async renderDonutPanel(
		parent: HTMLElement,
		title: string,
		subtitle: string,
		slices: { label: string; value: number }[],
	): Promise<void> {
		const panel = parent.createDiv({ cls: "pulse-stats-donut-panel" });
		panel.createEl("h4", { text: title, cls: "pulse-stats-donut-panel__title" });
		panel.createEl("p", { text: subtitle, cls: "pulse-stats-donut-panel__subtitle pulse-workout-muted" });

		if (slices.length === 0) {
			panel.createEl("p", { text: "No data yet.", cls: "pulse-workout-muted" });
			return;
		}

		const chartContainer = panel.createDiv({
			cls: "pulse-workout-chart-container pulse-workout-chart-small pulse-stats-donut-panel__chart",
		});
		const canvas = chartContainer.createEl("canvas");
		canvas.width = 300;
		canvas.height = 200;
		try {
			const chart = await renderRatioDoughnutChart(canvas, slices);
			this.charts.push(chart);
		} catch (e) {
			console.warn("Donut chart error:", e);
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
				const dateKey = workoutDateFromFrontmatter(
					session.frontmatter as unknown as Record<string, unknown>,
				);
				if (!dateKey) continue;
				const sessionDate = new Date(`${dateKey}T12:00:00`);
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
