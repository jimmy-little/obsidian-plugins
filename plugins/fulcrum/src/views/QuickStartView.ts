import {ItemView, WorkspaceLeaf} from "obsidian";
import {VIEW_QUICK_START} from "../fulcrum/constants";
import type {FulcrumHost} from "../fulcrum/pluginBridge";

export class QuickStartView extends ItemView {
	private readonly host: FulcrumHost;

	constructor(leaf: WorkspaceLeaf, host: FulcrumHost) {
		super(leaf);
		this.host = host;
	}

	getViewType(): string {
		return VIEW_QUICK_START;
	}

	getDisplayText(): string {
		return "Quick start";
	}

	getIcon(): string {
		return "play-circle";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		await this.host.timer.mountQuickStartView(this.contentEl);
	}

	async onClose(): Promise<void> {
		this.host.timer.unmountQuickStartView();
	}
}
