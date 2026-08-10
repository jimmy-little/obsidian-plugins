import {Setting} from "obsidian";
import type {FulcrumSettings} from "../../fulcrum/settingsDefaults";
import type {SettingsContext} from "../settingsContext";
import {
	displayToggleSetting,
	heading,
	settingsLead,
	textAreaSetting,
	textSetting,
	toggleSetting,
} from "../settingsHelpers";

export function renderTasksTab(ctx: SettingsContext): void {
	const {containerEl, plugin} = ctx;

	settingsLead(
		containerEl,
		"Control which tasks Fulcrum indexes and how they appear on cards and inline pills.",
	);

	new Setting(containerEl)
		.setName("Task sources")
		.setDesc(
			"Task notes: dedicated notes with your task tag or type: task. Obsidian tasks: markdown checkbox list items (- [ ]). Leave folder fields empty to scan the whole vault.",
		)
		.addDropdown((d) =>
			d
				.addOptions({
					taskNotes: "Task notes only",
					obsidianTasks: "Obsidian Tasks (inline) only",
					both: "Both",
				})
				.setValue(plugin.settings.taskSourceMode)
				.onChange(async (v) => {
					plugin.settings.taskSourceMode = v as FulcrumSettings["taskSourceMode"];
					await plugin.saveSettings();
					plugin.vaultIndex.scheduleRebuild();
				}),
		);

	textAreaSetting(
		ctx,
		"taskNotesFolderPaths",
		"Task notes folders",
		"Vault-relative paths, one per line or comma-separated. Empty = entire vault.",
	);
	textAreaSetting(
		ctx,
		"obsidianTasksFolderPaths",
		"Inline task folders",
		"Paths to scan for - [ ] tasks (one per line). Empty = entire vault. Prefix with ! to exclude a folder (e.g. !Templates/Checklists). Use !file:SKILL.md to skip files with that name (e.g. agent skill checklists).",
	);
	textSetting(ctx, "inlineTaskRegex", "Inline task filter (regex, optional)");
	textSetting(
		ctx,
		"inlineTaskIncludeTag",
		"Inline task include tag",
		"When set, only checkbox lines containing this tag (e.g. #task) are indexed and styled as inline task pills.",
	);
	textSetting(
		ctx,
		"taskTag",
		"Task tag",
		"YAML tag identifying task notes (without #). Default: task",
	);

	new Setting(containerEl)
		.setName("Task index scope")
		.setDesc(
			"Project-linked only: inline tasks need a +[[project]] link (or live on a project note). Plain [[links]] are page references only. All tasks: also index unlinked checkbox lines with a scheduled/due date or inline time range. When Task sources is Both, all checkbox lines in inline task folders are indexed for Horizon.",
		)
		.addDropdown((d) =>
			d
				.addOptions({
					projectLinked: "Project-linked only",
					all: "All tasks (include unlinked scheduled)",
				})
				.setValue(plugin.settings.taskIndexScope)
				.onChange(async (v) => {
					plugin.settings.taskIndexScope = v as FulcrumSettings["taskIndexScope"];
					await plugin.saveSettings();
					plugin.vaultIndex.scheduleRebuild();
				}),
		);

	heading(containerEl, "Task note card metadata");
	displayToggleSetting(ctx, "taskNoteCardShowScheduled", "Show scheduled date");
	displayToggleSetting(ctx, "taskNoteCardShowDue", "Show due date");
	displayToggleSetting(ctx, "taskNoteCardShowProject", "Show project");
	displayToggleSetting(ctx, "taskNoteCardShowTags", "Show tags");

	heading(containerEl, "Inline task metadata");
	displayToggleSetting(ctx, "inlineTaskShowScheduled", "Show scheduled date");
	displayToggleSetting(ctx, "inlineTaskShowDue", "Show due date");
	displayToggleSetting(ctx, "inlineTaskShowProject", "Show project");
	displayToggleSetting(ctx, "inlineTaskShowTags", "Show tags");
	displayToggleSetting(
		ctx,
		"taskSuppressDesignatedTagInDisplay",
		"Suppress designated task tag in display",
		"When on, hides the configured task tag from task card and inline pill metadata.",
	);
	displayToggleSetting(ctx, "taskCardShowSubtaskCount", "Show subtask count badge");
	displayToggleSetting(ctx, "taskCardShowRecurrenceIndicator", "Show recurrence indicator");

	heading(containerEl, "Creation defaults");
	textSetting(ctx, "taskNoteDefaultFolder", "Default folder for new task notes (optional)");
	textSetting(
		ctx,
		"taskNoteFilenamePattern",
		"Task note filename pattern",
		"Use {{title}} and {{date:YYYY-MM-DD}}.",
	);
	textSetting(ctx, "taskNoteBodyTemplatePath", "Task note body template (vault path, optional)");

	heading(containerEl, "Recurrence");
	toggleSetting(ctx, "recurrenceMaintainDueOffset", "Maintain due offset on recurring tasks");
	textSetting(ctx, "taskRecurrenceField", "Recurrence field");
	textSetting(ctx, "taskRemindersField", "Reminders field");
	textSetting(ctx, "taskRecurrenceAnchorField", "Recurrence anchor field");
	textSetting(ctx, "taskCompleteInstancesField", "Complete instances field");
	textSetting(ctx, "taskSkippedInstancesField", "Skipped instances field");
	textSetting(ctx, "taskNextOccurrencesField", "Next occurrences field");
	textSetting(ctx, "taskProjectsField", "Projects field (TaskNotes array)");
	textSetting(ctx, "taskRecurrenceParentField", "Recurrence parent field");
	textSetting(ctx, "taskOccurrenceDateField", "Occurrence date field");
}
