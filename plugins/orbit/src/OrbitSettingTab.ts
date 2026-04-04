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

		new Setting(containerEl)
			.setName("Activity preview entry field")
			.setDesc(
				"Inline metadata key skipped in feed excerpts (same as Fulcrum “entry”; leave blank to disable stripping only that key).",
			)
			.addText((t) => {
				t.setValue(this.plugin.settings.activityPreviewEntryField).onChange(async (v) => {
					this.plugin.settings.activityPreviewEntryField = v.trim() || "entry";
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Activity preview max lines")
			.setDesc("Lines of note body to show under each activity row (after frontmatter cleanup).")
			.addText((t) => {
				t.setValue(String(this.plugin.settings.activityPreviewMaxLines)).onChange(async (v) => {
					const n = parseInt(v, 10);
					this.plugin.settings.activityPreviewMaxLines =
						Number.isFinite(n) && n >= 1 ? Math.min(30, n) : 10;
					await this.plugin.saveSettings();
				});
			});

		const dowLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
		new Setting(containerEl)
			.setName("Week starts on")
			.setDesc("First row of the yearly activity heatmap on person profiles (GitHub-style grid).")
			.addDropdown((dd) => {
				for (let i = 0; i < 7; i++) {
					dd.addOption(String(i), dowLabels[i]);
				}
				dd.setValue(String(this.plugin.settings.firstDayOfWeek)).onChange(async (v) => {
					const n = parseInt(v, 10);
					this.plugin.settings.firstDayOfWeek =
						Number.isFinite(n) && n >= 0 && n <= 6 ? n : 0;
					await this.plugin.saveSettings();
				});
			});

		containerEl.createEl("h3", {text: "URL schemes (Obsidian URI)"});
		containerEl.createEl("p", {
			text: "URI host must be orbit (plugin id). Example: obsidian://orbit?screen=home. Do not prefix with action=open.",
		});
		const orbitUris: [string, string][] = [
			["/orbit/home (default)", "obsidian://orbit?screen=home"],
			["/orbit/org-chart — optional anchorPath=", "obsidian://orbit?screen=org-chart&anchorPath=People%2FExample.md"],
			["/orbit/person — requires path=", "obsidian://orbit?screen=person&path=People%2FExample.md"],
			["route=/orbit/home", "obsidian://orbit?route=%2Forbit%2Fhome"],
		];
		for (const [label, uri] of orbitUris) {
			containerEl.createEl("p", {text: label, cls: "setting-item-description"});
			const pre = containerEl.createEl("pre", {text: uri});
			pre.style.whiteSpace = "pre-wrap";
			pre.style.wordBreak = "break-all";
		}
	}
}
