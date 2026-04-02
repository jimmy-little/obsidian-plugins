import {App, Modal, TFile} from "obsidian";
import type {HeatmapDayFileRef} from "@obsidian-suite/heatmap";

/** Lists vault files counted on a heatmap day; click opens the note. */
export class HeatmapDayModal extends Modal {
	constructor(
		app: App,
		private readonly dateKey: string,
		private readonly files: HeatmapDayFileRef[],
	) {
		super(app);
	}

	override onOpen(): void {
		this.titleEl.setText(this.dateKey);
		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass("orbit-heatmap-day-modal");

		if (this.files.length === 0) {
			contentEl.createEl("p", {
				text: "No linked notes for this day.",
				cls: "orbit-muted",
			});
			return;
		}

		const ul = contentEl.createEl("ul", {cls: "orbit-heatmap-day-modal__list"});
		for (const f of this.files) {
			const li = ul.createEl("li");
			const btn = li.createEl("button", {
				type: "button",
				cls: "orbit-heatmap-day-modal__link",
				text: f.title,
			});
			btn.addEventListener("click", () => {
				const af = this.app.vault.getAbstractFileByPath(f.path);
				if (af instanceof TFile) {
					this.close();
					void this.app.workspace.getLeaf("tab").openFile(af);
				}
			});
		}
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
