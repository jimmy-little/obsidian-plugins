import {App, PluginSettingTab} from "obsidian";
import type RatchetPlugin from "./main";

export class RatchetSettingTab extends PluginSettingTab {
	constructor(app: App, plugin: RatchetPlugin) {
		super(app, plugin);
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		containerEl.createEl("h2", {text: "Ratchet"});

		containerEl.createEl("h3", {text: "URL schemes (Obsidian URI)"});
		containerEl.createEl("p", {
			text: "URI host must be ratchet. Opens the main view (same as the ribbon). Optional screen=main. Do not use action=open.",
		});
		const pre = containerEl.createEl("pre", {
			text: "obsidian://ratchet?screen=main",
		});
		pre.style.whiteSpace = "pre-wrap";
		pre.style.wordBreak = "break-all";
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "You can omit screen=; main is the default. Conceptual route: /ratchet/main.",
		});
	}
}
