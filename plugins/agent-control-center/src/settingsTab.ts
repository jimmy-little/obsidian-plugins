import { PluginSettingTab, Setting, type App } from "obsidian";
import { DEFAULT_SETTINGS } from "./settings";
import type AgentControlCenterPlugin from "./main";

export class AgentControlCenterSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: AgentControlCenterPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("p", {
			text: "Paths only. This plugin reports whether a key has a value. It does not show the value.",
		});

		new Setting(containerEl)
			.setName("Secrets file")
			.setDesc("The .env that skills read. ~ is fine.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.envFilePath)
					.setValue(this.plugin.settings.envFilePath)
					.onChange(async (value) => {
						this.plugin.settings.envFilePath = value.trim() || DEFAULT_SETTINGS.envFilePath;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Skills repo")
			.setDesc("Checkout that contains index.json and skills/*/SKILL.md.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.skillsRepoPath)
					.setValue(this.plugin.settings.skillsRepoPath)
					.onChange(async (value) => {
						this.plugin.settings.skillsRepoPath = value.trim() || DEFAULT_SETTINGS.skillsRepoPath;
						await this.plugin.saveSettings();
					}),
			);
	}
}
