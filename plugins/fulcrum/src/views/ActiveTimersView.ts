import {ItemView, WorkspaceLeaf} from "obsidian";
import {VIEW_ACTIVE_TIMERS} from "../fulcrum/constants";
import type {FulcrumHost} from "../fulcrum/pluginBridge";

export class ActiveTimersView extends ItemView {
	private readonly host: FulcrumHost;

	constructor(leaf: WorkspaceLeaf, host: FulcrumHost) {
		super(leaf);
		this.host = host;
	}

	getViewType(): string {
		return VIEW_ACTIVE_TIMERS;
	}

	getDisplayText(): string {
		return "Active timers";
	}

	getIcon(): string {
		return "timer";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		await this.host.timer.mountActiveTimersView(this.contentEl);
	}

	async onClose(): Promise<void> {
		this.host.timer.unmountActiveTimersView();
	}
}
