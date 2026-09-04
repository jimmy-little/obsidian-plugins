import {Modal, Notice, Setting} from "obsidian";
import type {App} from "obsidian";
import type {FulcrumHost} from "../pluginBridge";

export class DailyQuickNoteModal extends Modal {
	private text = "";

	constructor(
		app: App,
		private readonly host: FulcrumHost,
		private readonly dateIso: string,
	) {
		super(app);
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Quick note"});
		contentEl.createEl("p", {
			cls: "fulcrum-muted",
			text: `Adds a timestamped line to the daily note for ${this.dateIso}.`,
		});

		new Setting(contentEl)
			.setName("Note")
			.addTextArea((ta) => {
				ta.setPlaceholder("e.g. shipped the dashboard tweak");
				ta.inputEl.rows = 4;
				ta.onChange((v) => {
					this.text = v;
				});
			});

		new Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText("Add to daily note")
				.setCta()
				.onClick(() => {
					void this.submit();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		const trimmed = this.text.trim();
		if (!trimmed) {
			new Notice("Enter a note.");
			return;
		}
		const ok = await this.host.appendQuickNoteToDailyNote(this.dateIso, trimmed);
		if (ok) this.close();
	}
}
