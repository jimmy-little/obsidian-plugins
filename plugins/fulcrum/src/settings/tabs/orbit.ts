import {Setting} from "obsidian";
import type {AvatarStyle} from "../../orbit/orbit/settings";
import type {SettingsContext} from "../settingsContext";
import {heading, settingsLead, textSetting} from "../settingsHelpers";

function setPeopleDirsFromTextarea(plugin: SettingsContext["plugin"], value: string): void {
	plugin.settings.peopleDirs = value
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
}

export function renderOrbitTab(ctx: SettingsContext): void {
	const {containerEl, plugin, refresh} = ctx;

	settingsLead(
		containerEl,
		"Orbit people CRM: directories, profile chrome, interaction dates, and activity previews.",
	);

	heading(containerEl, "People directories");
	new Setting(containerEl)
		.setName("People directories")
		.setDesc(
			"Vault paths for person notes (one per line). Same list as Indexing → People folder. Orbit opens these in the profile view.",
		)
		.addTextArea((ta) => {
			ta.setPlaceholder("People\nContacts/Team");
			ta.setValue(plugin.settings.peopleDirs.join("\n"));
			ta.onChange(async (v) => {
				setPeopleDirsFromTextarea(plugin, v);
				await plugin.saveSettings();
				plugin.vaultIndex.scheduleRebuild();
				refresh();
			});
		});

	heading(containerEl, "Profile");
	textSetting(ctx, "peopleAvatarField", "Avatar frontmatter field");

	new Setting(containerEl)
		.setName("Avatar style")
		.addDropdown((dd) => {
			dd.addOption("circle", "Circle");
			dd.addOption("cover", "Cover");
			dd.addOption("thumbnail", "Thumbnail");
			dd.setValue(plugin.settings.avatarStyle).onChange(async (v) => {
				plugin.settings.avatarStyle = v as AvatarStyle;
				await plugin.saveSettings();
			});
		});

	new Setting(containerEl)
		.setName("Default banner color")
		.setDesc("Used when a person note has no color: frontmatter.")
		.addText((t) => {
			t.setValue(plugin.settings.defaultBannerColor).onChange(async (v) => {
				plugin.settings.defaultBannerColor = v.trim() || "#2a2a2a";
				await plugin.saveSettings();
			});
		});

	heading(containerEl, "Interactions");
	new Setting(containerEl)
		.setName("Date field")
		.setDesc("Primary frontmatter key for interaction dates.")
		.addText((t) => {
			t.setValue(plugin.settings.orbitDateField).onChange(async (v) => {
				plugin.settings.orbitDateField = v.trim() || "date";
				await plugin.saveSettings();
			});
		});

	new Setting(containerEl)
		.setName("Start time field")
		.setDesc("Secondary frontmatter key for interaction timestamps.")
		.addText((t) => {
			t.setValue(plugin.settings.orbitStartTimeField).onChange(async (v) => {
				plugin.settings.orbitStartTimeField = v.trim() || "startTime";
				await plugin.saveSettings();
			});
		});

	new Setting(containerEl)
		.setName("Activity preview entry field")
		.setDesc(
			"Inline metadata key skipped in feed excerpts (same as Fulcrum entry; leave blank to disable stripping only that key).",
		)
		.addText((t) => {
			t.setValue(plugin.settings.orbitActivityPreviewEntryField).onChange(async (v) => {
				plugin.settings.orbitActivityPreviewEntryField = v.trim() || "entry";
				await plugin.saveSettings();
			});
		});

	new Setting(containerEl)
		.setName("Activity preview max lines")
		.setDesc("Lines of note body to show under each activity row (after frontmatter cleanup).")
		.addText((t) => {
			t.setValue(String(plugin.settings.orbitActivityPreviewMaxLines)).onChange(async (v) => {
				const n = parseInt(v, 10);
				plugin.settings.orbitActivityPreviewMaxLines =
					Number.isFinite(n) && n >= 1 ? Math.min(30, n) : 10;
				await plugin.saveSettings();
			});
		});

	const dowLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
	new Setting(containerEl)
		.setName("Week starts on")
		.setDesc("First row of the yearly activity heatmap on person profiles (GitHub-style grid).")
		.addDropdown((dd) => {
			for (let i = 0; i < 7; i++) {
				dd.addOption(String(i), dowLabels[i]!);
			}
			dd.setValue(String(plugin.settings.orbitFirstDayOfWeek)).onChange(async (v) => {
				const n = parseInt(v, 10);
				plugin.settings.orbitFirstDayOfWeek =
					Number.isFinite(n) && n >= 0 && n <= 6 ? n : 0;
				await plugin.saveSettings();
			});
		});
}
