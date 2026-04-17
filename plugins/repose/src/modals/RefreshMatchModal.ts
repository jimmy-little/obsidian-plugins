import { App, Modal } from "obsidian";

export type RefreshPickItem<T> = {
	label: string;
	value: T;
	/** Extra context (e.g. year · platforms · id) */
	meta?: string;
	/** Optional left thumbnail (e.g. IGDB cover) */
	thumbUrl?: string | null;
};

export class RefreshMatchModal<T> extends Modal {
	constructor(
		app: App,
		private heading: string,
		private items: RefreshPickItem<T>[],
		private onChoose: (value: T) => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("repose-refresh-match-modal");
		contentEl.createEl("h2", { text: this.heading });
		const hint = contentEl.createEl("p", {
			text: "Choose the listing that matches this note.",
			cls: "repose-muted",
		});
		hint.style.marginTop = "0";

		for (const item of this.items) {
			const row = contentEl.createDiv({ cls: "repose-refresh-match-modal__row" });
			const btn = row.createEl("button", {
				type: "button",
				cls: "mod-cta repose-refresh-match-modal__pick",
			});
			btn.style.width = "100%";
			btn.style.textAlign = "left";
			btn.style.justifyContent = "flex-start";
			if (item.thumbUrl) {
				btn.createEl("img", {
					cls: "repose-refresh-match-modal__thumb",
					attr: { src: item.thumbUrl, alt: "", loading: "lazy", decoding: "async" },
				});
			}
			const textCol = btn.createDiv({ cls: "repose-refresh-match-modal__pick-text" });
			textCol.createDiv({ text: item.label, cls: "repose-refresh-match-modal__pick-title" });
			if (item.meta?.trim()) {
				textCol.createDiv({
					text: item.meta.trim(),
					cls: "repose-refresh-match-modal__pick-meta",
				});
			}
			btn.addEventListener("click", () => {
				btn.disabled = true;
				void (async () => {
					try {
						await this.onChoose(item.value);
					} finally {
						this.close();
					}
				})();
			});
		}

		const cancel = contentEl.createEl("button", { text: "Cancel", type: "button" });
		cancel.style.marginTop = "0.75rem";
		cancel.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
