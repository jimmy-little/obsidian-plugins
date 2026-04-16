import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import type ReposePlugin from "./main";
import { classifyFile } from "./match";
import type { MediaKind } from "./media";
import { MEDIA_KINDS, MEDIA_KIND_ICON, MEDIA_KIND_LABEL } from "./media";
import { AddMediaModal } from "./AddMediaModal";
import { safeSetIcon } from "./safeSetIcon";

export const VIEW_TYPE_REPOSE = "repose-library-view";

export class ReposeView extends ItemView {
	private root: HTMLElement | null = null;
	/** null = all types */
	private filterKind: MediaKind | null = null;
	private renderDebounceHandle = 0;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ReposePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_REPOSE;
	}

	getDisplayText(): string {
		return "Repose";
	}

	getIcon(): string {
		return "clapperboard";
	}

	async onOpen(): Promise<void> {
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (!file || !(file instanceof TFile) || file.extension !== "md") return;
				this.scheduleRender();
			}),
		);
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile && file.extension === "md") this.scheduleRender();
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile && file.extension === "md") this.scheduleRender();
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file) => {
				if (file instanceof TFile && file.extension === "md") this.scheduleRender();
			}),
		);

		this.contentEl.addClass("repose-view");
		this.render();
	}

	async onClose(): Promise<void> {
		window.clearTimeout(this.renderDebounceHandle);
		this.renderDebounceHandle = 0;
		this.contentEl.empty();
	}

	/** Coalesce metadata/vault storms (indexing, bulk image writes) into one redraw. */
	private scheduleRender(): void {
		window.clearTimeout(this.renderDebounceHandle);
		this.renderDebounceHandle = window.setTimeout(() => {
			this.renderDebounceHandle = 0;
			this.render();
		}, 150);
	}

	private openAdd(): void {
		new AddMediaModal(this.app, this.plugin).open();
	}

	private setFilter(kind: MediaKind | null): void {
		this.filterKind = kind;
		this.render();
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("repose-view");
		this.root = this.contentEl;

		const header = this.contentEl.createDiv({ cls: "repose-header" });
		const titleRow = header.createDiv({ cls: "repose-header-row" });
		titleRow.createEl("span", { text: "Library", cls: "repose-header-title" });
		const addBtn = titleRow.createEl("button", {
			type: "button",
			cls: "repose-icon-btn mod-cta",
			attr: { "aria-label": "Add media" },
		});
		safeSetIcon(addBtn, "plus");
		addBtn.addEventListener("click", () => this.openAdd());

		const filterRow = header.createDiv({ cls: "repose-filter-row" });
		const allBtn = filterRow.createEl("button", {
			type: "button",
			text: "All",
			cls: "repose-filter-chip",
		});
		allBtn.addClass(this.filterKind === null ? "repose-filter-chip--active" : "");
		allBtn.addEventListener("click", () => this.setFilter(null));

		for (const k of MEDIA_KINDS) {
			const b = filterRow.createEl("button", {
				type: "button",
				attr: { "aria-label": MEDIA_KIND_LABEL[k] },
				cls: "repose-filter-chip repose-filter-chip--icon",
			});
			safeSetIcon(b, MEDIA_KIND_ICON[k]);
			if (this.filterKind === k) b.addClass("repose-filter-chip--active");
			b.addEventListener("click", () => this.setFilter(this.filterKind === k ? null : k));
		}

		const listEl = this.contentEl.createDiv({ cls: "repose-list" });
		const files = this.getLibraryFiles();

		if (files.length === 0) {
			listEl.createDiv({
				text: "No notes match the current filter. Adjust settings or add an item.",
				cls: "repose-empty",
			});
			return;
		}

		for (const { file, kinds } of files) {
			const row = listEl.createDiv({ cls: "repose-row" });
			const icons = row.createDiv({ cls: "repose-row-icons" });
			for (const k of kinds) {
				const ic = icons.createSpan({ cls: "repose-row-icon", attr: { "aria-hidden": "true" } });
				safeSetIcon(ic, MEDIA_KIND_ICON[k]);
			}
			const label = row.createSpan({ text: file.basename, cls: "repose-row-label" });
			row.addEventListener("click", () => {
				void this.app.workspace.openLinkText(file.path, "", false);
			});
		}
	}

	private getLibraryFiles(): { file: TFile; kinds: MediaKind[] }[] {
		const out: { file: TFile; kinds: MediaKind[] }[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			const kinds = classifyFile(this.app, file, this.plugin.settings);
			if (kinds.length === 0) continue;
			if (this.filterKind !== null && !kinds.includes(this.filterKind)) continue;
			out.push({ file, kinds });
		}
		out.sort((a, b) => a.file.basename.localeCompare(b.file.basename));
		return out;
	}
}
