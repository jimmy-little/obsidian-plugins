import {Setting} from "obsidian";
import type {FulcrumSettings} from "../../fulcrum/settingsDefaults";
import type {SettingsContext} from "../settingsContext";
import {heading, settingsLead, textAreaSetting, textSetting, toggleSetting} from "../settingsHelpers";

export function renderIndexingTab(ctx: SettingsContext): void {
	const {containerEl, plugin, refresh} = ctx;

	settingsLead(
		containerEl,
		"Configure where Fulcrum looks in your vault for areas, projects, meetings, and linked notes.",
	);

	heading(containerEl, "Folders");
	textSetting(
		ctx,
		"areasProjectsFolder",
		"Areas & projects folder (fallback)",
		"When the optional folders below are empty, Fulcrum uses this path for both areas and projects (single-tree layout).",
	);
	textSetting(
		ctx,
		"areasFolder",
		"Areas folder (optional)",
		"When set, only notes under this path are indexed as areas. Leave empty to use the fallback folder above. Use when areas and projects live in different directories.",
	);
	textSetting(
		ctx,
		"projectsFolder",
		"Projects folder (optional)",
		"When set, only notes under this path are indexed as projects. Leave empty to use the fallback folder above.",
	);
	textSetting(ctx, "meetingsFolder", "Meetings folder root");
	textSetting(ctx, "completedProjectsFolder", "Completed projects folder");

	new Setting(containerEl)
		.setName("People folder")
		.setDesc(
			"Primary people directory. Wikilinks under configured people paths render as people pills. See Orbit tab for additional directories.",
		)
		.addText((t) =>
			t
				.setPlaceholder("e.g. People")
				.setValue(plugin.settings.peopleDirs[0] ?? "")
				.onChange(async (v) => {
					const trimmed = v.trim();
					const rest = plugin.settings.peopleDirs.slice(1);
					plugin.settings.peopleDirs = trimmed ? [trimmed, ...rest] : rest;
					await plugin.saveSettings();
					plugin.vaultIndex.scheduleRebuild();
				}),
		);

	new Setting(containerEl)
		.setName("Products folder")
		.setDesc(
			"When set, wikilinks to notes under this path render as product inline pills in markdown and activity previews.",
		)
		.addText((t) =>
			t
				.setPlaceholder("e.g. 20 Products")
				.setValue(plugin.settings.productsFolder)
				.onChange(async (v) => {
					plugin.settings.productsFolder = v;
					await plugin.saveSettings();
				}),
		);

	toggleSetting(
		ctx,
		"inferProjectsInAreasFolder",
		"Infer projects without type field",
		"When on, every note under the projects folder (see above) is treated as a project unless its type is the area value. Turn off to require an explicit project type in frontmatter.",
	);

	new Setting(containerEl)
		.setName("Indicate project status by")
		.setDesc(
			"Whether Fulcrum reads each project's status from frontmatter or from the folder layout under your projects folder (fallback path when projects folder is empty).",
		)
		.addDropdown((d) =>
			d
				.addOptions({
					frontmatter: "Frontmatter field",
					subfolder: "Subfolder",
				})
				.setValue(plugin.settings.projectStatusIndication)
				.onChange(async (v) => {
					plugin.settings.projectStatusIndication = v as FulcrumSettings["projectStatusIndication"];
					await plugin.saveSettings();
					plugin.vaultIndex.scheduleRebuild();
					refresh();
				}),
		);

	if (plugin.settings.projectStatusIndication === "frontmatter") {
		textSetting(ctx, "projectStatusField", "Project status field");
	} else {
		settingsLead(
			containerEl,
			"Each immediate subfolder of your projects folder is a status bucket. Notes directly in that folder use status \"active\" until you move them.",
		);
	}

	heading(containerEl, "Linked notes");
	textAreaSetting(
		ctx,
		"atomicNoteFolderPrefixes",
		"Atomic note folder prefixes",
		"One folder per line or comma-separated. Matches that path plus the current year (e.g. 60 Logs → 60 Logs/2026/…).",
	);
	new Setting(containerEl)
		.setName("Linked note title field")
		.setDesc("Frontmatter key and inline key:: for the primary line on project linked notes (often entry).")
		.addText((t) =>
			t.setValue(plugin.settings.atomicNoteEntryField).onChange(async (v) => {
				plugin.settings.atomicNoteEntryField = v;
				await plugin.saveSettings();
				plugin.vaultIndex.scheduleRebuild();
			}),
		);
}
