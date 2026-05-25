import { ItemView, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type PulsePlugin from "../main";
import { nutritionDayDisplayTitle, renderNutritionDayBody } from "../nutrition/renderNutritionDay";

export const VIEW_TYPE_PULSE_NUTRITION_DAY = "pulse-nutrition-day";

export class NutritionDayView extends ItemView {
	date: string | null = null;
	private chartHandle: { destroy(): void } | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: PulsePlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_PULSE_NUTRITION_DAY;
	}

	getDisplayText(): string {
		return this.date ? nutritionDayDisplayTitle(this.date) : "Nutrition";
	}

	getIcon(): string {
		return "apple";
	}

	getState(): Record<string, unknown> {
		return this.date ? { date: this.date } : {};
	}

	async setState(state: { date?: string }, _result: ViewStateResult): Promise<void> {
		if (state?.date) this.date = state.date;
		await this.render();
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async onClose(): Promise<void> {
		this.chartHandle?.destroy();
		this.chartHandle = null;
		this.contentEl.empty();
	}

	private async render(): Promise<void> {
		this.chartHandle?.destroy();
		this.chartHandle = null;
		this.contentEl.empty();
		this.contentEl.addClass("pulse-nutrition-day-view");

		const date = this.date;
		if (!date) {
			this.contentEl.createDiv({ text: "No date selected.", cls: "pulse-workout-muted" });
			return;
		}

		const main = this.contentEl.createDiv({ cls: "pulse-nutrition-day-view__body" });
		main.createDiv({ cls: "pulse-workout-loading", text: "Loading day…" });

		const { meals, monthPath } = await this.plugin.nutritionDataManager.loadDayEntries(date);
		main.empty();
		this.chartHandle = await renderNutritionDayBody(this.plugin, main, date, meals, monthPath);
	}
}
