import { Plugin } from "obsidian";
import { revealOrCreateView } from "@obsidian-suite/core";
import { createSuiteShellViewClass } from "@obsidian-suite/svelte-shell";
import App from "./App.svelte";

export const VIEW_TYPE = "crm-main";

const ShellView = createSuiteShellViewClass({
	viewType: VIEW_TYPE,
	displayText: "CRM",
	icon: "contact",
	App,
});

export default class CrmPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(VIEW_TYPE, (leaf) => new ShellView(leaf, this));

		this.addRibbonIcon("contact", "CRM", () => {
			void this.activateMainView();
		});

		this.addCommand({
			id: "open-main",
			name: "Open CRM",
			callback: () => void this.activateMainView(),
		});
	}

	async activateMainView(): Promise<void> {
		await revealOrCreateView(this.app, VIEW_TYPE, "sidebar");
	}
}
