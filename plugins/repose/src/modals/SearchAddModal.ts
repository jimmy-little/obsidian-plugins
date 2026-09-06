import { App, Modal } from "obsidian";
import type { SvelteComponent } from "svelte";
import type ReposePlugin from "../main";
import { reposeMobile } from "../platform";
import SearchAddPanel from "../svelte/SearchAddPanel.svelte";

/**
 * Add-media search (Trakt / IGDB / Open Library) in a workspace modal instead of the sidebar
 * to avoid layout churn and ResizeObserver feedback with the split pane.
 */
export class SearchAddModal extends Modal {
	private component: SvelteComponent | null = null;

	constructor(
		app: App,
		private plugin: ReposePlugin,
	) {
		super(app);
		this.setTitle("Add media");
	}

	onOpen(): void {
		this.modalEl.addClass("repose-search-add-modal");
		if (reposeMobile()) {
			this.modalEl.addClass("repose-search-add-modal--mobile");
		}
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("repose-search-add-modal__content");

		const mount = (): void => {
			const root = contentEl.createDiv({ cls: "repose-search-add-modal__mount" });
			this.component = new SearchAddPanel({
				target: root,
				intro: false,
				props: { plugin: this.plugin },
			});
		};

		if (reposeMobile()) {
			window.requestAnimationFrame(mount);
		} else {
			mount();
		}
	}

	onClose(): void {
		this.component?.$destroy();
		this.component = null;
		this.contentEl.empty();
		this.modalEl.removeClass("repose-search-add-modal");
		this.modalEl.removeClass("repose-search-add-modal--mobile");
	}
}
