import { ItemView, WorkspaceLeaf } from "obsidian";
import type { SvelteComponent } from "svelte";
import type CrmPlugin from "./main";
import App from "./App.svelte";

export const VIEW_TYPE = "crm-main";

export class ShellView extends ItemView {
	private component: SvelteComponent | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: CrmPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "CRM";
	}

	getIcon(): string {
		return "contact";
	}

	async onOpen(): Promise<void> {
		this.component = new App({
			target: this.contentEl,
			props: { title: "CRM" },
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
	}
}
