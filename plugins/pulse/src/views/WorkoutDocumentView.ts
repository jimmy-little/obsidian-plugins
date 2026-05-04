import { ItemView, TFile, WorkspaceLeaf, normalizePath, setIcon, type ViewStateResult } from "obsidian";
import { openNotePropertiesModal } from "@obsidian-suite/core";
import type PulsePlugin from "../main";
import { parseFrontmatter } from "../import/parsers";
import { renderSessionWorkoutBody } from "./renderSessionWorkoutBody";

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

	private resolveBannerSrc(bannerRaw: string): string | null {
		const m = String(bannerRaw ?? "").match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
		if (!m) return null;
		const inner = m[1]!.trim();
		const file = this.app.vault.getAbstractFileByPath(inner);
		if (file instanceof TFile) return this.app.vault.getResourcePath(file);
		return null;
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

		let bannerUrl: string | null = null;
		let title = file.basename.replace(/\.md$/i, "");
		try {
			const raw = await this.app.vault.read(file);
			const { frontmatter } = parseFrontmatter(raw);
			if (frontmatter.banner) {
				bannerUrl = this.resolveBannerSrc(String(frontmatter.banner));
			}
			if (frontmatter.name) title = String(frontmatter.name);
		} catch {
			/* ignore */
		}

		const mkOrbitStyleBtn = (row: HTMLElement, icon: string, label: string, onClick: () => void) => {
			const b = row.createEl("button", {
				type: "button",
				cls: "pulse-session-banner-btn pulse-session-banner-btn--icon-only",
				attr: { "aria-label": label, title: label },
			});
			const iconEl = b.createSpan({ cls: "pulse-session-banner-btn__icon" });
			setIcon(iconEl, icon);
			b.addEventListener("click", onClick);
		};

		if (bannerUrl) {
			const wrap = this.contentEl.createDiv({
				cls: "pulse-session-banner pulse-session-banner--has-image pulse-workout-doc__banner-wrap",
			});
			wrap.createEl("img", { cls: "pulse-session-banner__img", attr: { src: bannerUrl, alt: "" } });
			wrap.createDiv({ cls: "pulse-session-banner__scrim" });
			const actions = wrap.createDiv({ cls: "pulse-session-banner__actions" });
			const row = actions.createDiv({ cls: "pulse-session-banner-btn-row" });
			mkOrbitStyleBtn(row, "file-input", "Open note", () => {
				void this.app.workspace.getLeaf("tab").openFile(file);
			});
			mkOrbitStyleBtn(row, "file-json", "Edit properties", () => {
				openNotePropertiesModal(this.app, file, { displayTitleField: "name" });
			});
			mkOrbitStyleBtn(row, "layout-dashboard", "Open in Pulse", () => {
				void this.plugin.openPulseView("session", p);
			});
		} else {
			const toolbar = this.contentEl.createDiv({
				cls: "pulse-workout-doc__toolbar pulse-workout-doc__toolbar--no-banner",
			});
			const row = toolbar.createDiv({ cls: "pulse-session-banner-btn-row" });
			mkOrbitStyleBtn(row, "file-input", "Open note", () => {
				void this.app.workspace.getLeaf("tab").openFile(file);
			});
			mkOrbitStyleBtn(row, "file-json", "Edit properties", () => {
				openNotePropertiesModal(this.app, file, { displayTitleField: "name" });
			});
			mkOrbitStyleBtn(row, "layout-dashboard", "Open in Pulse", () => {
				void this.plugin.openPulseView("session", p);
			});
		}

		const head = this.contentEl.createDiv({ cls: "pulse-workout-doc__head" });
		head.createEl("h1", { text: title, cls: "pulse-workout-doc__title" });

		const main = this.contentEl.createDiv({ cls: "pulse-workout-doc__body" });
		const session = await this.plugin.workoutDataManager.getSessionForDisplay(p);
		if (!session) {
			main.createEl("p", {
				text: "Could not read this note as a Pulse workout/session.",
				cls: "pulse-workout-muted",
			});
			return;
		}
		await renderSessionWorkoutBody(this.plugin, main, session, p);
	}
}
