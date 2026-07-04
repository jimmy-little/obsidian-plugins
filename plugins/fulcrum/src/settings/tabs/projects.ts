import {Setting} from "obsidian";
import type {FulcrumSettings} from "../../fulcrum/settingsDefaults";
import type {SettingsContext} from "../settingsContext";
import {heading, settingsLead, textSetting} from "../settingsHelpers";

export function renderProjectsTab(ctx: SettingsContext): void {
	const {containerEl, plugin, refresh} = ctx;

	settingsLead(
		containerEl,
		"Project page behavior: review cadence, activity log, milestones, and new-note templates.",
	);

	new Setting(containerEl)
		.setName("Default review frequency (days)")
		.setDesc("Used when the project note has no frequency in frontmatter.")
		.addSlider((sl) =>
			sl
				.setLimits(1, 90, 1)
				.setValue(plugin.settings.defaultReviewFrequencyDays)
				.setDynamicTooltip()
				.onChange(async (v) => {
					plugin.settings.defaultReviewFrequencyDays = v;
					await plugin.saveSettings();
				}),
		);

	heading(containerEl, "Activity log");
	textSetting(ctx, "projectLogSectionHeading", "Project log section heading");
	textSetting(
		ctx,
		"projectMilestonesSectionHeading",
		"Milestones section heading",
		"Gantt reads `YYYY-MM-DD: Title` lines under this `##` heading in project notes.",
	);
	new Setting(containerEl)
		.setName("Project log preview lines")
		.setDesc(
			"How many recent log bullets to read from the project note (tail of the log section). Feeds the Activity view and refresh after append.",
		)
		.addSlider((sl) =>
			sl
				.setLimits(3, 30, 1)
				.setValue(plugin.settings.projectLogPreviewMaxLines)
				.setDynamicTooltip()
				.onChange(async (v) => {
					plugin.settings.projectLogPreviewMaxLines = v;
					await plugin.saveSettings();
				}),
		);

	heading(containerEl, "New note from template");
	new Setting(containerEl)
		.setName("Template path")
		.setDesc(
			"Vault path to a markdown note whose contents are copied for each new note. Leave empty to hide \"New note\" on project pages. Templater or core template syntax in the file is left as-is for those plugins to process after open.",
		)
		.addText((t) =>
			t
				.setPlaceholder("e.g. Templates/Project scratchpad.md")
				.setValue(plugin.settings.projectNewNoteTemplatePath)
				.onChange(async (v) => {
					plugin.settings.projectNewNoteTemplatePath = v;
					await plugin.saveSettings();
				}),
		);
	new Setting(containerEl)
		.setName("Destination")
		.setDesc(
			"Custom folder may use {{fulcrum_project}}, {{fulcrum_project_slug}}, {{fulcrum_project_link}}, {{fulcrum_project_path}}, and {{date:YYYY-MM-DD}} style tokens.",
		)
		.addDropdown((d) =>
			d
				.addOptions({
					projectFolder: "Same folder as the project note",
					customPath: "Custom folder path",
				})
				.setValue(plugin.settings.projectNewNoteDestinationMode)
				.onChange(async (v) => {
					plugin.settings.projectNewNoteDestinationMode =
						v as FulcrumSettings["projectNewNoteDestinationMode"];
					await plugin.saveSettings();
					refresh();
				}),
		);
	if (plugin.settings.projectNewNoteDestinationMode === "customPath") {
		new Setting(containerEl)
			.setName("Custom folder path")
			.setDesc("Vault-relative folder only (no filename). Created if missing.")
			.addText((t) =>
				t
					.setPlaceholder("e.g. 40 Projects/{{fulcrum_project_slug}}/Notes")
					.setValue(plugin.settings.projectNewNoteDestinationCustomPath)
					.onChange(async (v) => {
						plugin.settings.projectNewNoteDestinationCustomPath = v;
						await plugin.saveSettings();
					}),
			);
	}
	new Setting(containerEl)
		.setName("File name pattern")
		.setDesc(
			"File name only (not a path). Same placeholders as the custom folder. If the file exists, a numeric suffix is added before .md.",
		)
		.addText((t) =>
			t
				.setPlaceholder("{{date:YYYY-MM-DD}}-{{fulcrum_project_slug}}.md")
				.setValue(plugin.settings.projectNewNoteFileNamePattern)
				.onChange(async (v) => {
					plugin.settings.projectNewNoteFileNamePattern = v;
					await plugin.saveSettings();
				}),
		);
}
