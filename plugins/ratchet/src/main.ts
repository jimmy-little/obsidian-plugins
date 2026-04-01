import { Plugin } from "obsidian";
import { revealOrCreateView } from "@obsidian-suite/core";
import { createSuiteShellViewClass } from "@obsidian-suite/svelte-shell";
import App from "./App.svelte";

/** Match legacy obsidian-ratchet `VIEW_TYPE_RATCHET_MAIN` */
export const VIEW_TYPE = "ratchet-main-view";

const ShellView = createSuiteShellViewClass({
	viewType: VIEW_TYPE,
	displayText: "Ratchet",
	icon: "tally-5",
	App,
});

export default class RatchetPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(VIEW_TYPE, (leaf) => new ShellView(leaf, this));

		this.addRibbonIcon("tally-5", "Ratchet", () => {
			void this.activateMainView();
		});

		this.addCommand({
			id: "open-main",
			name: "Open Ratchet",
			callback: () => void this.activateMainView(),
		});
	}

	async activateMainView(): Promise<void> {
		await revealOrCreateView(this.app, VIEW_TYPE, "sidebar");
	}
}
