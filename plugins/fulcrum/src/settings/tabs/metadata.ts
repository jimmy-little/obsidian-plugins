import {Setting} from "obsidian";
import type {SettingsContext} from "../settingsContext";
import {heading, metadataGroup, settingsLead, textSetting} from "../settingsHelpers";

export function renderMetadataTab(ctx: SettingsContext): void {
	const {containerEl, plugin} = ctx;

	settingsLead(
		containerEl,
		"Map Fulcrum features to your vault's frontmatter field names. Defaults match common TaskNotes-style notes.",
	);

	metadataGroup(containerEl, "Core type & links", (body) => {
		const sub = {...ctx, containerEl: body};
		textSetting(sub, "typeField", "Note type field");
		textSetting(sub, "areaTypeValue", "Area type value");
		textSetting(sub, "projectTypeValue", "Project type value");
		textSetting(sub, "projectLinkField", "Project link field");
		textSetting(sub, "areaLinkField", "Area link field");
		textSetting(
			sub,
			"areaLifeModeField",
			"Area life-mode field",
			"Groups areas in the filter panel (e.g. Work, Personal, Professional, Freelance). Legacy work-related: true maps to Work when unset.",
		);
	});

	metadataGroup(containerEl, "Tasks", (body) => {
		const sub = {...ctx, containerEl: body};
		textSetting(sub, "taskStatusField", "Task status field");
		textSetting(sub, "taskPriorityField", "Task / project priority field");
		textSetting(sub, "taskDueDateField", "Task due date field");
		textSetting(sub, "taskScheduledDateField", "Task scheduled date field");
		textSetting(sub, "taskStartTimeField", "Task actual start time field");
		textSetting(sub, "taskEndTimeField", "Task actual end time field");
		textSetting(
			sub,
			"taskDurationField",
			"Task duration field (minutes, for calendar block height)",
		);
		textSetting(sub, "taskCompletedDateField", "Task completed date field");
		textSetting(sub, "taskTrackedMinutesField", "Task tracked minutes field");
		textSetting(sub, "taskTitleField", "Task title field");
		textSetting(sub, "taskNoteYamlStatusOpen", "Task note status when open (vault fallback)");
		textSetting(sub, "taskNoteYamlStatusDone", "Task note status when done (vault fallback)");
	});

	metadataGroup(containerEl, "Meetings", (body) => {
		const sub = {...ctx, containerEl: body};
		textSetting(sub, "meetingDateField", "Meeting date field");
		new Setting(body)
			.setName("Meeting start time field")
			.setDesc(
				"Optional. When set, used for date+time (enables hourly blocks in calendar). Leave empty to use date field only.",
			)
			.addText((t) =>
				t
					.setPlaceholder("e.g. startTime")
					.setValue(plugin.settings.meetingStartTimeField ?? "")
					.onChange(async (v) => {
						plugin.settings.meetingStartTimeField = v;
						await plugin.saveSettings();
						plugin.vaultIndex.scheduleRebuild();
					}),
			);
		new Setting(body)
			.setName("Meeting end time field")
			.setDesc(
				"Optional. When set with start time, duration is computed from end − start. Otherwise uses duration field.",
			)
			.addText((t) =>
				t
					.setPlaceholder("e.g. endTime")
					.setValue(plugin.settings.meetingEndTimeField ?? "")
					.onChange(async (v) => {
						plugin.settings.meetingEndTimeField = v;
						await plugin.saveSettings();
						plugin.vaultIndex.scheduleRebuild();
					}),
			);
		textSetting(sub, "meetingDurationField", "Meeting duration field");
		textSetting(sub, "meetingTotalMinutesField", "Meeting total minutes field");
		textSetting(sub, "meetingTitleField", "Meeting title field");
		new Setting(body)
			.setName("Meeting organizer field")
			.setDesc(
				"On notes under the meetings folder, companion chrome lists this person first. If they also appear elsewhere in frontmatter, the duplicate card is omitted.",
			)
			.addText((t) =>
				t
					.setPlaceholder("organizer")
					.setValue(plugin.settings.meetingOrganizerField)
					.onChange(async (v) => {
						plugin.settings.meetingOrganizerField = v;
						await plugin.saveSettings();
					}),
			);
	});

	metadataGroup(containerEl, "Projects", (body) => {
		const sub = {...ctx, containerEl: body};
		textSetting(sub, "projectEndDateField", "Project end date field");
		textSetting(sub, "projectLastReviewedField", "Last reviewed field");
		textSetting(sub, "projectReviewFrequencyField", "Review frequency field (days)");
		textSetting(sub, "projectNextReviewField", "Next review field");
		textSetting(sub, "projectDeadlineField", "Project deadline field (Kanban date axis)");
		textSetting(sub, "projectJiraField", "External link field (e.g. Jira)");
		textSetting(sub, "projectBannerField", "Banner image field");
		textSetting(sub, "projectColorField", "Project color field");
		textSetting(sub, "projectRelatedPeopleField", "Related people field");
		textSetting(sub, "projectRelatedProjectsField", "Related projects field");
		textSetting(sub, "projectRelatedProductsField", "Related products field");
		textSetting(sub, "projectRankField", "Project rank field (number; higher = more important)");
	});

	metadataGroup(containerEl, "People", (body) => {
		new Setting(body)
			.setName("People avatar field")
			.setDesc("Frontmatter key on people notes for avatar image. Used when people folder is set.")
			.addText((t) =>
				t
					.setPlaceholder("avatar")
					.setValue(plugin.settings.peopleAvatarField)
					.onChange(async (v) => {
						plugin.settings.peopleAvatarField = v;
						await plugin.saveSettings();
						plugin.vaultIndex.scheduleRebuild();
					}),
			);
	});

	heading(containerEl, "Status & priority vocab");
	textSetting(ctx, "taskStatuses", "Task statuses (comma-separated)");
	textSetting(ctx, "projectStatuses", "Project statuses (comma-separated)");
	textSetting(ctx, "priorities", "Priorities (comma-separated)");
	textSetting(ctx, "taskDoneStatuses", "Task done statuses (comma-separated)");
	textSetting(ctx, "projectActiveStatuses", "Project active statuses (comma-separated)");
	textSetting(ctx, "projectDoneStatuses", "Project done / inactive statuses (comma-separated)");
}
