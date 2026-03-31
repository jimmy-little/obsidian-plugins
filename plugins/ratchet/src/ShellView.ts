import { ItemView, WorkspaceLeaf } from "obsidian";
import type { SvelteComponent } from "svelte";
import type RatchetPlugin from "./main";
import App from "./App.svelte";

export const VIEW_TYPE = "ratchet-main";

export class ShellView extends ItemView {
	private component: SvelteComponent | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: RatchetPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Ratchet";
	}

	getIcon(): string {
		return "tally-5";
	}

	async onOpen(): Promise<void> {
		this.component = new App({
			target: this.contentEl,
			props: { title: "Ratchet" },
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
	}
}
