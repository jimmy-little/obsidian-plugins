import { App, Modal, Setting } from "obsidian";

export class EpisodeWatchDateModal extends Modal {
	constructor(
		app: App,
		private initialDate: string,
		private onSubmit: (calendarDate: string) => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("repose-watch-date-modal");

		contentEl.createEl("h2", { text: "Watch on a date" });
		contentEl.createEl("p", {
			text: "Set the watched date for this episode.",
			cls: "repose-muted",
		});

		let calendarDate = this.initialDate;

		new Setting(contentEl)
			.setName("Watched date")
			.addText((text) => {
				const input = text.inputEl;
				input.type = "date";
				input.value = calendarDate;
				input.addEventListener("change", () => {
					calendarDate = input.value;
				});
			});

		const actions = contentEl.createDiv({ cls: "repose-watch-date-modal__actions" });

		actions.createEl("button", { text: "Cancel", type: "button" }).addEventListener("click", () => {
			this.close();
		});

		const confirm = actions.createEl("button", { text: "Mark watched", type: "button", cls: "mod-cta" });
		confirm.addEventListener("click", () => {
			const input = contentEl.querySelector('input[type="date"]') as HTMLInputElement | null;
			const picked = input?.value?.trim() || calendarDate;
			if (!picked) return;
			confirm.disabled = true;
			void (async () => {
				try {
					await this.onSubmit(picked);
				} finally {
					this.close();
				}
			})();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
