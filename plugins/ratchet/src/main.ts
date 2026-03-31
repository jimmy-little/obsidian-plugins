import { Plugin } from "obsidian";
import { revealOrCreateView } from "@obsidian-suite/core";
import { ShellView, VIEW_TYPE } from "./ShellView";

export default class RatchetPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(VIEW_TYPE, (leaf) => new ShellView(leaf, this));

		this.addRibbonIcon("tally-5", "Ratchet", () => {
			void this.activateMainView();
		});

		this.addCommand({
			id: "open-main",
			name: "Open " + "Ratchet",
			callback: () => void this.activateMainView(),
		});
	}

	async activateMainView(): Promise<void> {
		await revealOrCreateView(this.app, VIEW_TYPE, "sidebar");
	}
}
