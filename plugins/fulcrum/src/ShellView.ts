import { ItemView, WorkspaceLeaf } from "obsidian";
import type { SvelteComponent } from "svelte";
import type FulcrumPlugin from "./main";
import App from "./App.svelte";

export const VIEW_TYPE = "fulcrum-main";

export class ShellView extends ItemView {
	private component: SvelteComponent | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: FulcrumPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Fulcrum";
	}

	getIcon(): string {
		return "layout-dashboard";
	}

	async onOpen(): Promise<void> {
		this.component = new App({
			target: this.contentEl,
			props: { title: "Fulcrum" },
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
	}
}
