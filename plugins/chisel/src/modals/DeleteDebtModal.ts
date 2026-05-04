import { App, Modal, Setting } from "obsidian";

export class DeleteDebtModal extends Modal {
	constructor(
		app: App,
		private message: string,
		private onConfirm: () => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText("Delete debt");
		contentEl.createEl("p", { text: this.message, cls: "chisel-delete-msg" });

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("Delete").setWarning().onClick(() => {
				void (async () => {
					await this.onConfirm();
					this.close();
				})();
			}),
		);
		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText("Cancel").onClick(() => this.close()),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
