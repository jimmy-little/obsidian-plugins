import {App, Setting} from "obsidian";
import type FulcrumPlugin from "../main";
import type {TimerSettings} from "./settings";

function heading(containerEl: HTMLElement, text: string): void {
	containerEl.createEl("h3", {text, cls: "fulcrum-settings-heading"});
}

async function saveTimer(plugin: FulcrumPlugin, patch: Partial<TimerSettings>): Promise<void> {
	Object.assign(plugin.settings.timer, patch);
	await plugin.saveSettings();
	plugin.timer.invalidateQuickStartCachesForIntegration();
}

export function displayTimerSettings(containerEl: HTMLElement, plugin: FulcrumPlugin): void {
	const timer = plugin.settings.timer;
	const refresh = (): void => {
		plugin.timer.invalidateQuickStartCachesForIntegration();
	};

	heading(containerEl, "Quick start");

	new Setting(containerEl)
		.setName("Templates folder")
		.setDesc(
			"Folder containing Quick Start template notes (one .md per button). Also used for inline `fulcrum-timer:TemplateName` code.",
		)
		.addText((text) =>
			text
				.setPlaceholder("Templates/Fulcrum Timer Buttons")
				.setValue(timer.timerButtonTemplatesFolder)
				.onChange(async (value) => {
					await saveTimer(plugin, {timerButtonTemplatesFolder: value});
				}),
		);

	new Setting(containerEl)
		.setName("Quick start area key")
		.setDesc("Frontmatter key for gray subtitle text on template cards (Timery-style), e.g. area or areaOfLife.")
		.addText((text) =>
			text
				.setPlaceholder("area")
				.setValue(timer.quickStartAreaKey)
				.onChange(async (value) => {
					await saveTimer(plugin, {quickStartAreaKey: value.trim() || "area"});
				}),
		);

	new Setting(containerEl)
		.setName("Quick start description key")
		.setDesc("Frontmatter key for the bottom line on template cards. Falls back to note name if empty.")
		.addText((text) =>
			text
				.setPlaceholder("entry")
				.setValue(timer.quickStartEntryKey)
				.onChange(async (value) => {
					await saveTimer(plugin, {quickStartEntryKey: value.trim() || "entry"});
				}),
		);

	new Setting(containerEl)
		.setName("Default project folder")
		.setDesc(
			"Optional. Each note in this folder (and subfolders) appears as an extra Quick Start button. Tapping starts a running timer for that project.",
		)
		.addText((text) =>
			text
				.setPlaceholder("Projects")
				.setValue(timer.defaultProjectFolder)
				.onChange(async (value) => {
					await saveTimer(plugin, {defaultProjectFolder: value.trim()});
				}),
		);

	new Setting(containerEl)
		.setName("Default save path for timer notes")
		.setDesc(
			"Path pattern for new timer notes. Date tokens: YYYY, MM, DD, HH, mm, ss (with or without {{ }}). Also {{project}}, {{title}}. If it does not end in .md, a filename is appended.",
		)
		.addText((text) =>
			text
				.setPlaceholder("Fulcrum/{{YYYY}}/{{MM}}")
				.setValue(timer.defaultTimerSavePath)
				.onChange(async (value) => {
					await saveTimer(plugin, {defaultTimerSavePath: value.trim()});
				}),
		);

	new Setting(containerEl)
		.setName("Default timer template")
		.setDesc(
			"Markdown template for project quick start and calendar notes. Supports {{project}}, {{title}}, {{date}}, {{now}}. Leave empty for a minimal note with a running timer.",
		)
		.addText((text) =>
			text
				.setPlaceholder("Templates/Fulcrum/Default Timer.md")
				.setValue(timer.defaultTimerTemplate)
				.onChange(async (value) => {
					await saveTimer(plugin, {defaultTimerTemplate: value.trim()});
				}),
		);

	heading(containerEl, "Timer display");

	new Setting(containerEl)
		.setName("Show status bar")
		.setDesc("Show active timer(s) in the Obsidian status bar.")
		.addToggle((toggle) =>
			toggle.setValue(timer.showStatusBar).onChange(async (value) => {
				await saveTimer(plugin, {showStatusBar: value});
				if (value) {
					plugin.timer.updateStatusBar();
				}
			}),
		);

	new Setting(containerEl)
		.setName("Hide timestamps in views")
		.setDesc("Strip date/time prefixes from note titles in timer views (display only).")
		.addToggle((toggle) =>
			toggle.setValue(timer.hideTimestampsInViews).onChange(async (value) => {
				await saveTimer(plugin, {hideTimestampsInViews: value});
				refresh();
			}),
		);

	new Setting(containerEl)
		.setName("Show duration on quick start buttons")
		.setDesc("Show tracked time on template buttons in the Quick Start panel.")
		.addToggle((toggle) =>
			toggle.setValue(timer.showDurationOnNoteButtons).onChange(async (value) => {
				await saveTimer(plugin, {showDurationOnNoteButtons: value});
				refresh();
			}),
		);

	if (timer.showDurationOnNoteButtons) {
		new Setting(containerEl)
			.setName("Duration type")
			.setDesc("Aggregate time by project or by note base name.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("project", "Project")
					.addOption("note", "Note")
					.setValue(timer.noteButtonDurationType)
					.onChange(async (value) => {
						await saveTimer(plugin, {
							noteButtonDurationType: value as TimerSettings["noteButtonDurationType"],
						});
					}),
			);

		new Setting(containerEl)
			.setName("Duration time period")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("today", "Today")
					.addOption("thisWeek", "This week")
					.addOption("thisMonth", "This month")
					.addOption("lastWeek", "Last week")
					.addOption("lastMonth", "Last month")
					.setValue(timer.noteButtonTimePeriod)
					.onChange(async (value) => {
						await saveTimer(plugin, {
							noteButtonTimePeriod: value as TimerSettings["noteButtonTimePeriod"],
						});
					}),
			);
	}

	heading(containerEl, "Timer frontmatter");

	new Setting(containerEl)
		.setName("Project key")
		.setDesc("Frontmatter key for project name on timer notes.")
		.addText((text) =>
			text
				.setPlaceholder("project")
				.setValue(timer.projectKey)
				.onChange(async (value) => {
					await saveTimer(plugin, {projectKey: value});
				}),
		);

	new Setting(containerEl)
		.setName("Default tag on note")
		.setDesc("Tag added to notes when a timer entry is created (e.g. #fulcrum-timer).")
		.addText((text) =>
			text
				.setPlaceholder("#fulcrum-timer")
				.setValue(timer.defaultTagOnNote)
				.onChange(async (value) => {
					await saveTimer(plugin, {defaultTagOnNote: value});
				}),
		);

	new Setting(containerEl)
		.setName("Default tag on time entries")
		.setDesc("Tag automatically added to new time entries (leave empty for none).")
		.addText((text) =>
			text
				.setPlaceholder("#work")
				.setValue(timer.defaultTagOnTimeEntries)
				.onChange(async (value) => {
					await saveTimer(plugin, {defaultTagOnTimeEntries: value});
				}),
		);

	heading(containerEl, "Timer controls");

	new Setting(containerEl)
		.setName("Show seconds")
		.addToggle((toggle) =>
			toggle.setValue(timer.showSeconds).onChange(async (value) => {
				await saveTimer(plugin, {showSeconds: value});
			}),
		);

	new Setting(containerEl)
		.setName("Time adjustment (minutes)")
		.setDesc("Minutes to shift start time with << and >> controls in timer blocks.")
		.addText((text) =>
			text
				.setPlaceholder("5")
				.setValue(String(timer.timeAdjustMinutes))
				.onChange(async (value) => {
					const n = Number.parseInt(value, 10);
					await saveTimer(plugin, {timeAdjustMinutes: Number.isFinite(n) ? n : 5});
				}),
		);

	heading(containerEl, "Planned blocks");

	new Setting(containerEl)
		.setName("Planner folder")
		.setDesc("Per-day notes YYYY-MM-DD.md store planned blocks (not logged until you start a timer).")
		.addText((text) =>
			text
				.setPlaceholder("Fulcrum/Planner")
				.setValue(timer.plannedBlocksFolder)
				.onChange(async (value) => {
					await saveTimer(plugin, {plannedBlocksFolder: value.trim() || "Fulcrum/Planner"});
				}),
		);

	new Setting(containerEl)
		.setName("Planner frontmatter key")
		.addText((text) =>
			text
				.setPlaceholder("fulcrum_planned")
				.setValue(timer.plannedBlocksKey)
				.onChange(async (value) => {
					await saveTimer(plugin, {plannedBlocksKey: value.trim() || "fulcrum_planned"});
				}),
		);

	new Setting(containerEl)
		.setName("Calendar: draw new slot as")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("ask", "Ask (plan vs log)")
				.addOption("plan", "Always plan")
				.addOption("log", "Always log time")
				.setValue(timer.calendarDrawMode)
				.onChange(async (value) => {
					await saveTimer(plugin, {calendarDrawMode: value as TimerSettings["calendarDrawMode"]});
				}),
		);

	// Tabled: native macOS/iOS companion + widget bridge (companion/, timer/WidgetBridge.ts).
	// Use command palette → "Open Floating Timers View" for a desktop pop-out instead.
	/*
	heading(containerEl, "Widget companion");
	...
	*/
}
