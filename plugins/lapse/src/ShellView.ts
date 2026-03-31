import { ItemView, WorkspaceLeaf } from "obsidian";
import type { SvelteComponent } from "svelte";
import type LapsePlugin from "./main";
import App from "./App.svelte";

export const VIEW_TYPE = "lapse-tracker-main";

export class ShellView extends ItemView {
	private component: SvelteComponent | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: LapsePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Lapse";
	}

	getIcon(): string {
		return "clock";
	}

	async onOpen(): Promise<void> {
		this.component = new App({
			target: this.contentEl,
			props: { title: "Lapse" },
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
	}
}
