import {App, PluginSettingTab, Setting} from "obsidian";
import type OrbitPlugin from "./main";
import type {AvatarStyle} from "./orbit/settings";

export class OrbitSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: OrbitPlugin) {
		super(app, plugin);
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		containerEl.createEl("h2", {text: "Orbit"});

		new Setting(containerEl)
			.setName("People directories")
			.setDesc(
				"Vault paths for person notes (one per line). Orbit opens these files in the profile view instead of the default editor.",
			)
			.addTextArea((ta) => {
				ta.setPlaceholder("People\nContacts/Team");
				ta.setValue(this.plugin.settings.peopleDirs.join("\n"));
				ta.onChange(async (v) => {
					this.plugin.settings.peopleDirs = v
						.split("\n")
						.map((s) => s.trim())
						.filter(Boolean);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Avatar frontmatter field")
			.setDesc("YAML key for the profile image (default: avatar).")
			.addText((t) => {
				t.setValue(this.plugin.settings.avatarFrontmatterField).onChange(async (v) => {
					this.plugin.settings.avatarFrontmatterField = v.trim() || "avatar";
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Avatar style")
			.addDropdown((dd) => {
				dd.addOption("circle", "Circle");
				dd.addOption("cover", "Cover");
				dd.addOption("thumbnail", "Thumbnail");
				dd.setValue(this.plugin.settings.avatarStyle).onChange(async (v) => {
					this.plugin.settings.avatarStyle = v as AvatarStyle;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Default banner color")
			.setDesc("Used when a person note has no color: frontmatter.")
			.addText((t) => {
				t.setValue(this.plugin.settings.defaultBannerColor).onChange(async (v) => {
					this.plugin.settings.defaultBannerColor = v.trim() || "#2a2a2a";
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Date field")
			.setDesc("Primary frontmatter key for interaction dates.")
			.addText((t) => {
				t.setValue(this.plugin.settings.dateField).onChange(async (v) => {
					this.plugin.settings.dateField = v.trim() || "date";
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Start time field")
			.setDesc("Secondary frontmatter key for interaction timestamps.")
			.addText((t) => {
				t.setValue(this.plugin.settings.startTimeField).onChange(async (v) => {
					this.plugin.settings.startTimeField = v.trim() || "startTime";
					await this.plugin.saveSettings();
				});
			});
	}
}
