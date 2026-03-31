import {ItemView, WorkspaceLeaf} from "obsidian";
import type {SvelteComponent} from "svelte";
import {VIEW_DASHBOARD} from "../fulcrum/constants";
import type {FulcrumHost} from "../fulcrum/pluginBridge";
import Dashboard from "../svelte/Dashboard.svelte";

export class DashboardView extends ItemView {
	private readonly host: FulcrumHost;
	private component: SvelteComponent | null = null;

	constructor(leaf: WorkspaceLeaf, host: FulcrumHost) {
		super(leaf);
		this.host = host;
	}

	getViewType(): string {
		return VIEW_DASHBOARD;
	}

	getDisplayText(): string {
		return "Fulcrum dashboard";
	}

	getIcon(): string {
		return "layout-dashboard";
	}

	async onOpen(): Promise<void> {
		this.component = new Dashboard({
			target: this.contentEl,
			props: {plugin: this.host, hoverParentLeaf: this.leaf},
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
	}
}
