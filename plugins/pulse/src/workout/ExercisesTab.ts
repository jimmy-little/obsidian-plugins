import { Notice } from "obsidian";
import type PulsePlugin from "../main";
import type { ExerciseNote, NewExerciseData } from "./types";
import { renderProgressChart } from "./charts";
import {
	type ExerciseGroupBy,
	exerciseMatchesFilter,
	getStoredExerciseGroupBy,
	groupExercisesBy,
	setStoredExerciseGroupBy,
} from "./exerciseListUi";

export class ExercisesTab {
	private plugin: PulsePlugin;
	private container: HTMLElement | null = null;
	private chart: { destroy(): void } | null = null;

	constructor(plugin: PulsePlugin) {
		this.plugin = plugin;
	}

	async render(container: HTMLElement): Promise<void> {
		this.container = container;
		container.empty();
		container.createDiv({ cls: "pulse-workout-loading", text: "Loading exercises..." });

		const dm = this.plugin.workoutDataManager;
		const exercises = await dm.getAllExercises();

		container.empty();
		const wrapper = container.createDiv({ cls: "pulse-workout-exercises" });

		// Search + group (match sidebar / Fulcrum-style header controls)
		const searchBar = wrapper.createDiv({ cls: "pulse-workout-search-bar pulse-workout-search-bar--split" });
		const groupWrap = searchBar.createDiv({ cls: "pulse-workout-group-by" });
		groupWrap.createEl("label", { text: "Group", cls: "pulse-workout-group-by-label" });
		const groupSelect = groupWrap.createEl("select", {
			cls: "pulse-workout-select pulse-workout-select--compact",
		});
		for (const o of [
			{ value: "movement", label: "Movement" },
			{ value: "equipment", label: "Equipment" },
			{ value: "body_part", label: "Body part" },
		] as { value: ExerciseGroupBy; label: string }[]) {
			groupSelect.createEl("option", { text: o.label, value: o.value });
		}
		groupSelect.value = getStoredExerciseGroupBy();

		const searchInputWrap = searchBar.createDiv({ cls: "pulse-workout-search-input-wrap" });
		const hintId = "pulse-modal-exercise-hints";
		const dataList = searchInputWrap.createEl("datalist", { attr: { id: hintId } });
		const hintSeen = new Set<string>();
		for (const e of exercises) {
			const n = e.frontmatter.name.trim();
			if (n && !hintSeen.has(n)) {
				hintSeen.add(n);
				dataList.createEl("option", { attr: { value: n } });
			}
		}
		const searchInput = searchInputWrap.createEl("input", {
			type: "search",
			cls: "pulse-workout-search",
			placeholder: "Find exercises…",
			attr: { list: hintId, autocomplete: "off" },
		});

		const newBtn = searchBar.createEl("button", {
			text: "+ New",
			cls: "pulse-workout-btn pulse-workout-btn-primary pulse-workout-btn-small",
		});
		newBtn.addEventListener("click", () => this.showNewExerciseForm());

		const listContainer = wrapper.createDiv({ cls: "pulse-workout-exercise-groups" });

		const renderGrouped = (filter: string) => {
			listContainer.empty();
			const by = getStoredExerciseGroupBy();
			groupSelect.value = by;
			const filtered = exercises.filter(e => exerciseMatchesFilter(e, filter));
			const grouped = groupExercisesBy(filtered, by);

			if (grouped.size === 0) {
				listContainer.createEl("p", { text: "No exercises found.", cls: "pulse-workout-muted" });
				return;
			}

			const keys = [...grouped.keys()].sort((a, b) => a.localeCompare(b));
			for (const key of keys) {
				const exList = grouped.get(key)!;
				exList.sort((a, b) => a.frontmatter.name.localeCompare(b.frontmatter.name));

				const group = listContainer.createDiv({ cls: "pulse-workout-exercise-group" });
				group.createEl("h4", { text: key, cls: "pulse-workout-group-header" });

				for (const ex of exList) {
					const row = group.createDiv({ cls: "pulse-workout-exercise-row" });
					const info = row.createDiv({ cls: "pulse-workout-exercise-info" });
					info.createSpan({ text: ex.frontmatter.name });
					const details: string[] = [];
					if (ex.frontmatter.body_part) details.push(ex.frontmatter.body_part);
					if (ex.frontmatter.equipment) details.push(ex.frontmatter.equipment);
					if (ex.frontmatter["pr-weight"]) {
						details.push(`PR: ${ex.frontmatter["pr-weight"]} ${ex.frontmatter.unit}`);
					}
					info.createSpan({ text: details.join(" • "), cls: "pulse-workout-muted" });

					row.addEventListener("click", () => this.showExerciseDetail(ex));
				}
			}
		};

		groupSelect.addEventListener("change", () => {
			setStoredExerciseGroupBy(groupSelect.value as ExerciseGroupBy);
			renderGrouped(searchInput.value);
		});

		renderGrouped("");
		searchInput.addEventListener("input", () => renderGrouped(searchInput.value));
	}

	private async showExerciseDetail(exercise: ExerciseNote): Promise<void> {
		if (!this.container) return;
		this.container.empty();
		this.destroyChart();

		const detail = this.container.createDiv({ cls: "pulse-workout-exercise-detail" });

		const header = detail.createDiv({ cls: "pulse-workout-detail-header" });
		const backBtn = header.createEl("button", { text: "← Back", cls: "pulse-workout-btn pulse-workout-btn-link" });
		backBtn.addEventListener("click", () => this.render(this.container!));

		header.createEl("h3", { text: exercise.frontmatter.name });

		const meta = detail.createDiv({ cls: "pulse-workout-exercise-meta" });
		meta.createSpan({ text: exercise.frontmatter.movement });
		if (exercise.frontmatter.body_part) meta.createSpan({ text: exercise.frontmatter.body_part });
		meta.createSpan({ text: exercise.frontmatter.equipment });
		meta.createSpan({ text: exercise.frontmatter.unit });

		if (exercise.frontmatter["pr-weight"]) {
			const prBadge = detail.createDiv({ cls: "pulse-workout-pr-badge" });
			prBadge.createSpan({ text: `PR: ${exercise.frontmatter["pr-weight"]} ${exercise.frontmatter.unit}` });
			if (exercise.frontmatter["pr-date"]) {
				prBadge.createSpan({ text: ` on ${exercise.frontmatter["pr-date"]}`, cls: "pulse-workout-muted" });
			}
		}

		// Chart (1+ sessions with weighted sets — Chart.js; otherwise hint text)
		const chartContainer = detail.createDiv({ cls: "pulse-workout-chart-container" });
		const hasWeighted = exercise.log.some(e =>
			e.sets.some(s => s.weight != null && s.reps != null && (s.weight ?? 0) > 0)
		);
		if (!hasWeighted) {
			chartContainer.createEl("p", {
				text: "Log weighted sets to see estimated 1RM progress.",
				cls: "pulse-workout-muted",
			});
		} else {
			const canvas = chartContainer.createEl("canvas");
			canvas.width = 400;
			canvas.height = 200;
			try {
				this.chart = await renderProgressChart(canvas, exercise.log, "Estimated 1RM");
			} catch (e) {
				console.warn("Failed to render chart:", e);
				chartContainer.createEl("p", { text: "Chart unavailable", cls: "pulse-workout-muted" });
			}
		}

		// Log table
		if (exercise.log.length > 0) {
			detail.createEl("h4", { text: "History" });
			const table = detail.createEl("table", { cls: "pulse-workout-detail-table" });
			const thead = table.createEl("thead");
			const headerRow = thead.createEl("tr");
			["Date", "Sets", "Max Weight", "Volume"].forEach(h => headerRow.createEl("th", { text: h }));

			const tbody = table.createEl("tbody");
			for (const entry of exercise.log) {
				const row = tbody.createEl("tr");
				row.createEl("td", { text: entry.date });
				row.createEl("td", { text: String(entry.sets.length) });
				const maxW = Math.max(...entry.sets.filter(s => s.weight != null).map(s => s.weight!), 0);
				row.createEl("td", { text: maxW > 0 ? `${maxW} ${exercise.frontmatter.unit}` : "—" });
				const vol = entry.sets.reduce((s, set) => s + ((set.weight ?? 0) * (set.reps ?? 0)), 0);
				row.createEl("td", { text: vol > 0 ? vol.toLocaleString() : "—" });
			}
		} else {
			detail.createEl("p", { text: "No history yet.", cls: "pulse-workout-muted" });
		}
	}

	private showNewExerciseForm(): void {
		if (!this.container) return;
		this.container.empty();
		this.renderNewExerciseForm(this.container, () => this.render(this.container!));
	}

	renderNewExerciseForm(target: HTMLElement, onDone: () => void): void {
		const form = target.createDiv({ cls: "pulse-workout-new-exercise" });

		const nameInput = this.createFormField(form, "Name", "text", "e.g. Bench Press");
		const movementInput = this.createFormField(form, "Movement", "text", "e.g. Push, Pull, Legs");
		const bodyPartInput = this.createFormField(form, "Body part", "text", "e.g. Chest, Back, Shoulders");
		const equipmentInput = this.createFormField(form, "Equipment", "text", "e.g. Barbell, Dumbbell");
		const tagsInput = this.createFormField(form, "Tags", "text", "e.g. chest, triceps");

		const unitRow = form.createDiv({ cls: "pulse-workout-form-row" });
		unitRow.createEl("label", { text: "Unit" });
		const unitSelect = unitRow.createEl("select", { cls: "pulse-workout-select" });
		unitSelect.createEl("option", { text: "lb", value: "lb" });
		unitSelect.createEl("option", { text: "kg", value: "kg" });
		unitSelect.value = this.plugin.settings.weightUnit;

		const actions = form.createDiv({ cls: "pulse-workout-form-actions" });
		const cancelBtn = actions.createEl("button", { text: "Cancel", cls: "pulse-workout-btn pulse-workout-btn-secondary" });
		cancelBtn.addEventListener("click", () => onDone());

		const saveBtn = actions.createEl("button", { text: "Create", cls: "pulse-workout-btn pulse-workout-btn-primary" });
		saveBtn.addEventListener("click", async () => {
			const name = (nameInput as HTMLInputElement).value.trim();
			if (!name) { new Notice("Name is required"); return; }

			const data: NewExerciseData = {
				name,
				movement: (movementInput as HTMLInputElement).value.trim() || "Uncategorized",
				body_part: (bodyPartInput as HTMLInputElement).value.trim() || undefined,
				equipment: (equipmentInput as HTMLInputElement).value.trim() || "Bodyweight",
				unit: unitSelect.value as "lb" | "kg",
				tags: (tagsInput as HTMLInputElement).value.split(",").map(t => t.trim()).filter(Boolean),
			};

			try {
				await this.plugin.workoutDataManager.createExercise(data);
				new Notice(`Created ${name}`);
				onDone();
			} catch (e) {
				new Notice(`Failed to create exercise: ${e instanceof Error ? e.message : e}`);
			}
		});
	}

	private createFormField(parent: HTMLElement, label: string, type: string, placeholder: string): HTMLElement {
		const row = parent.createDiv({ cls: "pulse-workout-form-row" });
		row.createEl("label", { text: label });
		return row.createEl("input", { type, cls: "pulse-workout-input pulse-workout-input-full", placeholder });
	}

	private destroyChart(): void {
		if (this.chart) { this.chart.destroy(); this.chart = null; }
	}

	destroy(): void {
		this.destroyChart();
		this.container = null;
	}
}
