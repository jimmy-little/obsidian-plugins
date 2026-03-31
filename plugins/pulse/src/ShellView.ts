import { ItemView, WorkspaceLeaf } from "obsidian";
import type { SvelteComponent } from "svelte";
import type PulsePlugin from "./main";
import App from "./App.svelte";

export const VIEW_TYPE = "pulse-main";

export class ShellView extends ItemView {
	private component: SvelteComponent | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: PulsePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Pulse";
	}

	getIcon(): string {
		return "activity";
	}

	async onOpen(): Promise<void> {
		this.component = new App({
			target: this.contentEl,
			props: { title: "Pulse" },
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
	}
}
