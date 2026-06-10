import {ItemView, WorkspaceLeaf} from "obsidian";
import type {SvelteComponent} from "svelte";
import {VIEW_QUICK_START} from "../fulcrum/constants";
import type {FulcrumHost} from "../fulcrum/pluginBridge";
import QuickStart from "../svelte/QuickStart.svelte";

export class QuickStartView extends ItemView {
	private readonly host: FulcrumHost;
	private component: SvelteComponent | null = null;

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
		this.component = new QuickStart({
			target: this.contentEl,
			props: {plugin: this.host},
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
	}
}
