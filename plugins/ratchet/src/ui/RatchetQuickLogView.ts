import { ItemView, WorkspaceLeaf } from "obsidian";
import type RatchetPlugin from "../main";
import { renderQuickLogSection } from "./renderQuickLogSection";

export const VIEW_TYPE_RATCHET_QUICK_LOG = "ratchet-quick-log-view";

export class RatchetQuickLogView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: RatchetPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_RATCHET_QUICK_LOG;
	}

	getDisplayText(): string {
		return "Ratchet log";
	}

	getIcon(): string {
		return "tally-5";
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("ratchet-view-root", "ratchet-ql-leaf");
		this.render();
	}

	async onClose(): Promise<void> {}

	/** @internal */
	render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("ratchet-view-root", "ratchet-ql-leaf");
		const inner = this.contentEl.createDiv({ cls: "ratchet-ql-leaf-inner" });
		renderQuickLogSection(inner, this.plugin, {
			onRefresh: () => this.plugin.refreshRatchetViews(),
			openEditTracker: (id) => void this.plugin.openRatchetDashboardForEdit(id),
			openNewTracker: () => void this.plugin.openRatchetNewTracker(),
		});
	}
}
