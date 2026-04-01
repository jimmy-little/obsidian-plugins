import { Plugin } from "obsidian";
import { revealOrCreateView } from "@obsidian-suite/core";
import { createSuiteShellViewClass } from "@obsidian-suite/svelte-shell";
import App from "./App.svelte";

export const VIEW_TYPE = "pulse-main";

const ShellView = createSuiteShellViewClass({
	viewType: VIEW_TYPE,
	displayText: "Pulse",
	icon: "activity",
	App,
});

export default class PulsePlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(VIEW_TYPE, (leaf) => new ShellView(leaf, this));

		this.addRibbonIcon("activity", "Pulse", () => {
			void this.activateMainView();
		});

		this.addCommand({
			id: "open-main",
			name: "Open Pulse",
			callback: () => void this.activateMainView(),
		});
	}

	async activateMainView(): Promise<void> {
		await revealOrCreateView(this.app, VIEW_TYPE, "sidebar");
	}
}
