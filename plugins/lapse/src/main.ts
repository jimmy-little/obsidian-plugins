import { Plugin } from "obsidian";
import { revealOrCreateView } from "@obsidian-suite/core";
import { createSuiteShellViewClass } from "@obsidian-suite/svelte-shell";
import App from "./App.svelte";

/** Main shell view id (legacy multi-view Lapse uses additional types). */
export const VIEW_TYPE = "lapse-tracker-main";

const ShellView = createSuiteShellViewClass({
	viewType: VIEW_TYPE,
	displayText: "Lapse",
	icon: "clock",
	App,
});

export default class LapsePlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(VIEW_TYPE, (leaf) => new ShellView(leaf, this));

		this.addRibbonIcon("clock", "Lapse", () => {
			void this.activateMainView();
		});

		this.addCommand({
			id: "open-main",
			name: "Open Lapse",
			callback: () => void this.activateMainView(),
		});
	}

	async activateMainView(): Promise<void> {
		await revealOrCreateView(this.app, VIEW_TYPE, "sidebar");
	}
}
