import { App, Modal, ButtonComponent, TextComponent } from "obsidian";
import type ReposePlugin from "./main";
import type { MediaKind } from "./media";
import { MEDIA_KINDS, MEDIA_KIND_ICON, MEDIA_KIND_LABEL } from "./media";
import { createMediaNote } from "./createMediaNote";
import { safeSetIcon } from "./safeSetIcon";

export class AddMediaModal extends Modal {
	private kind: MediaKind = "show";

	constructor(
		app: App,
		private plugin: ReposePlugin,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("repose-add-modal");

		contentEl.createEl("h2", { text: "Add to library" });

		const titleTc = new TextComponent(contentEl);
		titleTc.setPlaceholder("Title");
		const input = titleTc.inputEl;
		input.addClass("repose-add-modal-title");

		contentEl.createEl("p", {
			text: "Type",
			cls: "setting-item-name",
		});

		const iconRow = contentEl.createDiv({ cls: "repose-type-icons" });

		const tmdbWrap = contentEl.createDiv({ cls: "repose-add-tmdb-wrap" });
		tmdbWrap.createEl("p", {
			text: "TMDB ID (optional, shows & movies)",
			cls: "setting-item-name",
		});
		const tmdbTc = new TextComponent(tmdbWrap);
		tmdbTc.setPlaceholder("e.g. 1396");
		const tmdbInput = tmdbTc.inputEl;
		tmdbInput.addClass("repose-add-modal-tmdb");

		const syncTmdbVisibility = (): void => {
			const on = this.kind === "show" || this.kind === "movie";
			tmdbWrap.style.display = on ? "" : "none";
		};

		for (const k of MEDIA_KINDS) {
			const btn = iconRow.createEl("button", {
				type: "button",
				attr: { "aria-label": MEDIA_KIND_LABEL[k] },
				cls: "repose-type-icon-btn",
			});
			safeSetIcon(btn, MEDIA_KIND_ICON[k]);
			btn.addEventListener("click", () => {
				this.kind = k;
				iconRow.querySelectorAll(".repose-type-icon-btn").forEach((el) => {
					el.toggleClass("repose-type-icon-btn--active", el === btn);
				});
				syncTmdbVisibility();
			});
		}
		const firstBtn = iconRow.querySelector(".repose-type-icon-btn");
		if (firstBtn instanceof HTMLElement) firstBtn.addClass("repose-type-icon-btn--active");
		syncTmdbVisibility();

		const btnRow = contentEl.createDiv({ cls: "repose-add-modal-actions" });
		new ButtonComponent(btnRow).setButtonText("Cancel").onClick(() => this.close());
		new ButtonComponent(btnRow)
			.setButtonText("Create note")
			.setCta()
			.onClick(() => {
				const title = input.value.trim();
				if (!title) return;
				let tmdbId: number | undefined;
				if (this.kind === "show" || this.kind === "movie") {
					const raw = tmdbInput.value.trim();
					if (raw) {
						const n = Number.parseInt(raw, 10);
						if (Number.isFinite(n)) tmdbId = Math.trunc(n);
					}
				}
				void createMediaNote(this.app, this.plugin.settings, this.kind, title, {
					tmdbId,
				}).then(() => this.close());
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
