import { App, Modal } from "obsidian";
import type { WorkoutListEntry } from "./types";
import { formatWorkoutStatsLine } from "./workoutListUi";

export class WorkoutMergeModal extends Modal {
	constructor(
		app: App,
		private readonly source: WorkoutListEntry,
		private readonly targets: WorkoutListEntry[],
		private readonly weightUnit: "lb" | "kg",
		private readonly onPick: (target: WorkoutListEntry) => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		contentEl.empty();
		contentEl.addClass("pulse-workout-merge-modal");
		titleEl.setText("Merge workout");

		contentEl.createEl("p", {
			cls: "pulse-workout-merge-lede",
			text: `“${this.source.displayName}” will merge into the selected workout, then be deleted.`,
		});

		if (this.targets.length === 0) {
			contentEl.createEl("p", {
				cls: "pulse-workout-muted",
				text: "No other workouts on this day.",
			});
			return;
		}

		const list = contentEl.createDiv({ cls: "pulse-workout-merge-list" });
		for (const target of this.targets) {
			const option = list.createDiv({
				cls: "pulse-workout-merge-option",
				attr: { role: "button", tabindex: "0" },
			});
			option.createDiv({ cls: "pulse-workout-merge-option__title", text: target.displayName });
			const stats = formatWorkoutStatsLine(target, this.weightUnit);
			if (stats) {
				option.createDiv({ cls: "pulse-workout-merge-option__meta", text: stats });
			}
			option.createDiv({
				cls: "pulse-workout-merge-option__hint",
				text: "Merge into this note",
			});
			const pick = (): void => {
				void Promise.resolve(this.onPick(target)).then(() => this.close());
			};
			option.addEventListener("click", pick);
			option.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					pick();
				}
			});
		}
	}
}
