import {App, Modal, Setting, TFile} from "obsidian";

/** Permanent-delete confirmation for a person note. */
export class ConfirmDeletePersonModal extends Modal {
	constructor(
		app: App,
		private readonly file: TFile,
		private readonly onConfirm: () => Promise<void>,
	) {
		super(app);
	}

	override onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass("orbit-confirm-delete");
		this.titleEl.setText("Delete this note permanently?");
		contentEl.createEl("p", {
			text: "This removes the file from the vault immediately (not the Obsidian trash). Links to it may break.",
			cls: "orbit-muted",
		});
		contentEl.createEl("p", {
			text: this.file.path,
			cls: "mod-warning",
		});

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText("Delete permanently")
					.setWarning()
					.onClick(() => void this.runConfirm()),
			);
	}

	private async runConfirm(): Promise<void> {
		await this.onConfirm();
		this.close();
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
