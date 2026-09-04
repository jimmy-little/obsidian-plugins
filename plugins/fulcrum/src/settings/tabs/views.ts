import {Setting} from "obsidian";
import type {FulcrumSettings} from "../../fulcrum/settingsDefaults";
import {DEFAULT_SETTINGS} from "../../fulcrum/settingsDefaults";
import type {SettingsContext} from "../settingsContext";
import {heading, settingsLead, textSetting, toggleSetting} from "../settingsHelpers";

export function renderViewsTab(ctx: SettingsContext): void {
	const {containerEl, plugin} = ctx;

	settingsLead(
		containerEl,
		"Default layout for dashboards, Kanban, Calendar, Timeline, and how Fulcrum opens views.",
	);

	heading(containerEl, "Dashboard & project list");
	new Setting(containerEl)
		.setName("Dashboard activity (days)")
		.setDesc(
			"How many days of history to show in the Dashboard Activity section (1–7). The list is also limited to the 80 most recent items.",
		)
		.addSlider((sl) =>
			sl
				.setLimits(1, 7, 1)
				.setValue(plugin.settings.globalActivityDisplayDays)
				.setDynamicTooltip()
				.onChange(async (v) => {
					plugin.settings.globalActivityDisplayDays = v;
					await plugin.saveSettings();
				}),
		);
	new Setting(containerEl)
		.setName("Project list: group by")
		.setDesc(
			"Dashboard and Project Manager sidebar. None shows a single sorted list. You can also change grouping from the list header.",
		)
		.addDropdown((d) =>
			d
				.addOptions({
					area: "Area",
					status: "Status",
					reviewDue: "Review due",
					none: "None",
				})
				.setValue(plugin.settings.dashboardActiveProjectsGroupBy)
				.onChange(async (v) => {
					plugin.settings.dashboardActiveProjectsGroupBy =
						v as FulcrumSettings["dashboardActiveProjectsGroupBy"];
					await plugin.saveSettings();
				}),
		);
	new Setting(containerEl)
		.setName("Project list: sort by")
		.setDesc(
			"Order within each group or the flat list (end date and next review use your project page date fields; name is alphabetical).",
		)
		.addDropdown((d) =>
			d
				.addOptions({
					launch: "End date",
					nextReview: "Next review",
					rank: "Rank",
					name: "Name",
				})
				.setValue(plugin.settings.projectSidebarSortBy)
				.onChange(async (v) => {
					plugin.settings.projectSidebarSortBy = v as FulcrumSettings["projectSidebarSortBy"];
					await plugin.saveSettings();
				}),
		);
	new Setting(containerEl)
		.setName("Project list: sort direction")
		.setDesc("Ascending vs descending for the sort above. For rank, descending lists highest (most important) first.")
		.addDropdown((d) =>
			d
				.addOptions({asc: "Ascending", desc: "Descending"})
				.setValue(plugin.settings.projectSidebarSortDir)
				.onChange(async (v) => {
					plugin.settings.projectSidebarSortDir = v as FulcrumSettings["projectSidebarSortDir"];
					await plugin.saveSettings();
				}),
		);

	heading(containerEl, "Tasks view");
	new Setting(containerEl)
		.setName("Tasks view: group by")
		.setDesc("Default grouping in the center task list (day, project, or tag).")
		.addDropdown((d) =>
			d
				.addOptions({day: "Day", project: "Project", tag: "Tag"})
				.setValue(plugin.settings.tasksViewGroupBy)
				.onChange(async (v) => {
					plugin.settings.tasksViewGroupBy = v as FulcrumSettings["tasksViewGroupBy"];
					await plugin.saveSettings();
				}),
		);
	new Setting(containerEl)
		.setName("Tasks view: future day sections")
		.setDesc("How many day sections to show after today in day grouping (1–60).")
		.addSlider((sl) =>
			sl
				.setLimits(1, 60, 1)
				.setValue(plugin.settings.tasksViewFutureDays)
				.setDynamicTooltip()
				.onChange(async (v) => {
					plugin.settings.tasksViewFutureDays = v;
					await plugin.saveSettings();
				}),
		);

	heading(containerEl, "Kanban");
	new Setting(containerEl)
		.setName("Default Kanban view")
		.addDropdown((d) =>
			d
				.addOptions({projects: "Projects", tasks: "Tasks"})
				.setValue(plugin.settings.kanbanView)
				.onChange(async (v) => {
					plugin.settings.kanbanView = v as FulcrumSettings["kanbanView"];
					await plugin.saveSettings();
				}),
		);
	new Setting(containerEl)
		.setName("Kanban columns by")
		.addDropdown((d) =>
			d
				.addOptions({area: "Area", project: "Project", status: "Status", date: "Date"})
				.setValue(plugin.settings.kanbanColumnBy)
				.onChange(async (v) => {
					plugin.settings.kanbanColumnBy = v as FulcrumSettings["kanbanColumnBy"];
					await plugin.saveSettings();
				}),
		);
	new Setting(containerEl)
		.setName("Kanban swimlanes by")
		.addDropdown((d) =>
			d
				.addOptions({
					none: "None",
					area: "Area",
					project: "Project",
					status: "Status",
					date: "Date",
				})
				.setValue(plugin.settings.kanbanSwimlaneBy)
				.onChange(async (v) => {
					plugin.settings.kanbanSwimlaneBy = v as FulcrumSettings["kanbanSwimlaneBy"];
					await plugin.saveSettings();
				}),
		);
	new Setting(containerEl)
		.setName("Kanban project date axis")
		.setDesc("When columns or swimlanes group projects by date.")
		.addDropdown((d) =>
			d
				.addOptions({nextReview: "Next review", deadline: "Deadline"})
				.setValue(plugin.settings.kanbanProjectDateSource)
				.onChange(async (v) => {
					plugin.settings.kanbanProjectDateSource =
						v as FulcrumSettings["kanbanProjectDateSource"];
					await plugin.saveSettings();
				}),
		);

	heading(containerEl, "Timeline");
	new Setting(containerEl)
		.setName("Daily note planner")
		.setDesc(
			"Show time blocks under a heading in each daily note on the Timeline (Day Planner format, e.g. 10:00 - 10:30 Deep work). Uses core Daily Notes or Periodic Notes paths.",
		)
		.addToggle((t) =>
			t.setValue(plugin.settings.timelineDailyPlannerEnabled).onChange(async (v) => {
				plugin.settings.timelineDailyPlannerEnabled = v;
				await plugin.saveSettings();
				plugin.vaultIndex.scheduleRebuild();
			}),
		);

	new Setting(containerEl)
		.setName("Start of day")
		.setDesc("Timeline grid begins at this time (24-hour, e.g. 05:00).")
		.addText((tx) =>
			tx
				.setPlaceholder("00:00")
				.setValue(plugin.settings.timelineStartOfDay)
				.onChange(async (v) => {
					const trimmed = v.trim();
					plugin.settings.timelineStartOfDay = trimmed || DEFAULT_SETTINGS.timelineStartOfDay;
					await plugin.saveSettings();
				}),
		);

	new Setting(containerEl)
		.setName("Hours to display")
		.setDesc(
			"Number of hours shown on the Timeline (e.g. 05:00 start + 16 hours → 5:00 AM through 9:00 PM).",
		)
		.addText((tx) =>
			tx
				.setPlaceholder("24")
				.setValue(String(plugin.settings.timelineHoursToDisplay))
				.onChange(async (v) => {
					const n = Number.parseInt(v, 10);
					plugin.settings.timelineHoursToDisplay =
						Number.isFinite(n) && n > 0 ? Math.min(24, n) : 24;
					await plugin.saveSettings();
				}),
		);

	textSetting(
		ctx,
		"plannerHeading",
		"Planner heading",
		"Exact heading text for the day plan section. Leave empty to use the whole daily note.",
	);
	new Setting(containerEl)
		.setName("Default time block length (minutes)")
		.setDesc(
			"Height for timed blocks without an end time, and length used when adding a new time block.",
		)
		.addText((tx) =>
			tx
				.setPlaceholder("30")
				.setValue(String(plugin.settings.plannerDefaultDurationMinutes))
				.onChange(async (v) => {
					const n = Number.parseInt(v, 10);
					plugin.settings.plannerDefaultDurationMinutes =
						Number.isFinite(n) && n > 0 ? n : 30;
					await plugin.saveSettings();
					plugin.vaultIndex.scheduleRebuild();
				}),
		);

	heading(containerEl, "World clocks");
	textSetting(
		ctx,
		"worldClocks",
		"World clocks",
		"Comma-separated Label|IANA timezone. Leave the zone empty for local time (HOME). Example: Washington|America/New_York,Paris|Europe/Paris,HOME|",
	);

	heading(containerEl, "General");
	new Setting(containerEl)
		.setName("Open views in")
		.addDropdown((d) =>
			d
				.addOptions({main: "Main area (new tab)", sidebar: "Right sidebar"})
				.setValue(plugin.settings.openViewsIn)
				.onChange(async (v) => {
					plugin.settings.openViewsIn = v as FulcrumSettings["openViewsIn"];
					await plugin.saveSettings();
				}),
		);
	new Setting(containerEl)
		.setName("Hover preview delay (ms)")
		.setDesc(
			"Delay before showing the page preview on hover over activity rows and linked items. 0 = instant. 1500–2000 ms reduces accidental pop-ups.",
		)
		.addSlider((sl) =>
			sl
				.setLimits(0, 3000, 250)
				.setValue(plugin.settings.hoverPreviewDelayMs)
				.setDynamicTooltip()
				.onChange(async (v) => {
					plugin.settings.hoverPreviewDelayMs = v;
					await plugin.saveSettings();
				}),
		);
	toggleSetting(ctx, "showRibbonIcon", "Show dashboard ribbon icon");
	new Setting(containerEl)
		.setName("Calendar: first day of week")
		.addDropdown((d) =>
			d
				.addOptions({"0": "Sunday", "1": "Monday", "6": "Saturday"})
				.setValue(String(plugin.settings.calendarFirstDayOfWeek))
				.onChange(async (v) => {
					plugin.settings.calendarFirstDayOfWeek = Number(v);
					await plugin.saveSettings();
				}),
		);
}
