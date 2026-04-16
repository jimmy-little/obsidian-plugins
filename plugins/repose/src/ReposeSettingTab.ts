import { App, PluginSettingTab, Setting } from "obsidian";
import type ReposePlugin from "./main";
import type { MediaKind } from "./media";
import { MEDIA_KINDS, MEDIA_KIND_LABEL } from "./media";
import type { TypeMatchMode } from "./settings";

export class ReposeSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		public plugin: ReposePlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Repose" });

		new Setting(containerEl)
			.setName("Open view in")
			.setDesc("Where the Repose library opens when using the ribbon or command.")
			.addDropdown((d) =>
				d
					.addOption("main", "Main tab")
					.addOption("sidebar", "Right sidebar")
					.setValue(this.plugin.settings.openViewsIn)
					.onChange(async (v) => {
						this.plugin.settings.openViewsIn = v === "sidebar" ? "sidebar" : "main";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default folder for new notes")
			.setDesc(
				"Used when the type rule is Tag or Frontmatter (Folder rules use the configured folder path). Relative to vault root, e.g. Media/Inbox.",
			)
			.addText((t) =>
				t
					.setPlaceholder("e.g. Media")
					.setValue(this.plugin.settings.defaultNewNoteFolder)
					.onChange(async (v) => {
						this.plugin.settings.defaultNewNoteFolder = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("TMDB API key")
			.setDesc(
				"Optional. Used to download poster, banner, logo, and thumb for shows and movies (see themoviedb.org). Stored in this plugin’s data file.",
			)
			.addText((t) =>
				t
					.setPlaceholder("API v3 key")
					.setValue(this.plugin.settings.tmdbApiKey)
					.onChange(async (v) => {
						this.plugin.settings.tmdbApiKey = v;
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl("h3", { text: "Type detection" });
		containerEl.createEl("p", {
			text: "Each media type is detected using one rule. Leave the text empty to disable that type.",
			cls: "setting-item-description",
		});

		for (const kind of MEDIA_KINDS) {
			const rule = this.plugin.settings.typeRules[kind];
			const heading = containerEl.createDiv({ cls: "repose-settings-type-block" });
			heading.createEl("h4", { text: MEDIA_KIND_LABEL[kind] });

			new Setting(heading)
				.setName("Match using")
				.addDropdown((d) => {
					const opts: { value: TypeMatchMode; label: string }[] = [
						{ value: "tag", label: "Tag" },
						{ value: "folder", label: "Folder" },
						{ value: "frontmatter", label: "Frontmatter" },
					];
					for (const o of opts) d.addOption(o.value, o.label);
					return d.setValue(rule.mode).onChange(async (v) => {
						this.plugin.settings.typeRules[kind].mode = v as TypeMatchMode;
						await this.plugin.saveSettings();
						this.display();
					});
				});

			const desc =
				rule.mode === "folder"
					? "Folder path (includes subfolders), relative to vault root."
					: rule.mode === "tag"
						? "Tag to match (do not include #)."
						: "Frontmatter key:value pair, e.g. mediaType: podcast";

			new Setting(heading).setName("Match text").setDesc(desc).addText((t) =>
				t.setValue(rule.text).onChange(async (v) => {
					this.plugin.settings.typeRules[kind].text = v;
					await this.plugin.saveSettings();
				}),
			);
		}
	}
}
