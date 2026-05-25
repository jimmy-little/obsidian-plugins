import { ItemView, TFile, WorkspaceLeaf, normalizePath, type ViewStateResult } from "obsidian";
import type PulsePlugin from "../main";
import { parseFrontmatter } from "../import/parsers";
import { renderSessionWorkoutBody } from "./renderSessionWorkoutBody";
import { renderWorkoutSessionHeader } from "./renderWorkoutSessionHeader";

export const VIEW_TYPE_PULSE_WORKOUT_DOC = "pulse-workout-document";

export class WorkoutDocumentView extends ItemView {
	workoutPath: string | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: PulsePlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_PULSE_WORKOUT_DOC;
	}

	getDisplayText(): string {
		if (!this.workoutPath) return "Workout";
		const f = this.app.vault.getAbstractFileByPath(this.workoutPath);
		return f instanceof TFile ? f.basename.replace(/\.md$/i, "") : "Workout";
	}

	getIcon(): string {
		return "dumbbell";
	}

	getState(): Record<string, unknown> {
		return this.workoutPath ? { path: this.workoutPath } : {};
	}

	async setState(state: { path?: string }, _result: ViewStateResult): Promise<void> {
		if (state?.path) {
			this.workoutPath = normalizePath(state.path);
		}
		await this.render();
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	private async render(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("pulse-workout-doc");

		const p = this.workoutPath;
		if (!p) {
			this.contentEl.createDiv({ text: "No workout path.", cls: "pulse-workout-muted" });
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(p);
		if (!(file instanceof TFile)) {
			this.contentEl.createDiv({ text: "Note not found.", cls: "pulse-workout-muted" });
			return;
		}

		let rawFm: Record<string, unknown> = {};
		try {
			const raw = await this.app.vault.read(file);
			const parsed = parseFrontmatter(raw);
			rawFm = parsed.frontmatter as Record<string, unknown>;
		} catch {
			/* ignore */
		}

		const content = this.contentEl.createDiv({ cls: "pulse-workout-doc__content" });
		const session = await this.plugin.workoutDataManager.getSessionForDisplay(p);
		if (!session) {
			content.createEl("p", {
				text: "Could not read this note as a Pulse workout/session.",
				cls: "pulse-workout-muted",
			});
			return;
		}

		renderWorkoutSessionHeader(this.plugin, content, session, rawFm, {
			bannerWrapClass: "pulse-workout-doc__banner-wrap",
			onRefresh: () => this.render(),
			onGoHome: () => void this.plugin.openPulseView("today"),
			onDeleted: () => {
				this.workoutPath = null;
				void this.leaf.detach();
			},
		});

		const main = content.createDiv({ cls: "pulse-workout-doc__body" });
		await renderSessionWorkoutBody(this.plugin, main, session, p, rawFm);
	}
}
