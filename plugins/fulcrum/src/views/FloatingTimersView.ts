import {ItemView, WorkspaceLeaf} from "obsidian";
import {VIEW_FLOATING_TIMERS} from "../fulcrum/constants";
import type {FulcrumHost} from "../fulcrum/pluginBridge";

/** Combined active timers + quick start for a desktop pop-out window. */
export class FloatingTimersView extends ItemView {
	private readonly host: FulcrumHost;

	constructor(leaf: WorkspaceLeaf, host: FulcrumHost) {
		super(leaf);
		this.host = host;
	}

	getViewType(): string {
		return VIEW_FLOATING_TIMERS;
	}

	getDisplayText(): string {
		return "Fulcrum Timers";
	}

	getIcon(): string {
		return "timer";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("fulcrum-floating-timers");
		await this.host.timer.mountFloatingTimersHud(this.contentEl);
	}

	async onClose(): Promise<void> {
		this.host.timer.unmountFloatingTimersHud();
	}
}
