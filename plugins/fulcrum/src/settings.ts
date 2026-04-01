import {App, Notice, PluginSettingTab, Setting} from "obsidian";
import {getTaskNotesHealth} from "./fulcrum/taskNotesApi";
import type {FulcrumSettings} from "./fulcrum/settingsDefaults";
import type FulcrumPlugin from "./main";

export type {FulcrumSettings} from "./fulcrum/settingsDefaults";
export {DEFAULT_SETTINGS} from "./fulcrum/settingsDefaults";

function heading(containerEl: HTMLElement, text: string): void {
	containerEl.createEl("h3", {text, cls: "fulcrum-settings-heading"});
}

export class FulcrumSettingTab extends PluginSettingTab {
	plugin: FulcrumPlugin;

	constructor(app: App, plugin: FulcrumPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl("p", {
			text: "Fulcrum indexes areas, projects, task notes, and meetings from your vault using configurable folders and frontmatter keys.",
			cls: "fulcrum-settings-lead",
		});

		heading(containerEl, "Folders");
		this.textSetting(
			"areasProjectsFolder",
			"Areas & projects folder (fallback)",
			"When the optional folders below are empty, Fulcrum uses this path for both areas and projects (single-tree layout).",
		);
		this.textSetting(
			"areasFolder",
			"Areas folder (optional)",
			"When set, only notes under this path are indexed as areas. Leave empty to use the fallback folder above. Use when areas and projects live in different directories.",
		);
		this.textSetting(
			"projectsFolder",
			"Projects folder (optional)",
			"When set, only notes under this path are indexed as projects. Leave empty to use the fallback folder above.",
		);
		this.textSetting("meetingsFolder", "Meetings folder root");
		this.textSetting("completedProjectsFolder", "Completed projects folder");
		this.toggleSetting(
			"inferProjectsInAreasFolder",
			"Infer projects without type field",
			"When on, every note under the projects folder (see above) is treated as a project unless its type is the area value. Turn off to require an explicit project type in frontmatter.",
		);
		new Setting(containerEl)
			.setName("Indicate project status by")
			.setDesc(
				"Whether Fulcrum reads each project’s status from frontmatter or from the folder layout under your projects folder (fallback path when projects folder is empty).",
			)
			.addDropdown((d) =>
				d
					.addOptions({
						frontmatter: "Frontmatter field",
						subfolder: "Subfolder",
					})
					.setValue(this.plugin.settings.projectStatusIndication)
					.onChange(async (v) => {
						this.plugin.settings.projectStatusIndication = v as FulcrumSettings["projectStatusIndication"];
						await this.plugin.saveSettings();
						this.plugin.vaultIndex.scheduleRebuild();
						this.display();
					}),
			);
		if (this.plugin.settings.projectStatusIndication === "frontmatter") {
			this.textSetting(
				"projectStatusField",
				"Project status field",
			);
		} else {
			containerEl.createEl("p", {
				cls: "fulcrum-settings-lead",
				text: "Each immediate subfolder of your projects folder is a status bucket. Notes directly in that folder use status “active” until you move them.",
			});
		}

		heading(containerEl, "Frontmatter keys");
		this.textSetting("typeField", "Note type field");
		this.textSetting("areaTypeValue", "Area type value");
		this.textSetting("projectTypeValue", "Project type value");
		this.textSetting("projectLinkField", "Project link field");
		this.textSetting("areaLinkField", "Area link field");
		this.textSetting("taskStatusField", "Task status field");
		this.textSetting("taskPriorityField", "Task / project priority field");
		this.textSetting("taskDueDateField", "Task due date field");
		this.textSetting("taskScheduledDateField", "Task scheduled date field");
		this.textSetting("taskStartTimeField", "Task actual start time field");
		this.textSetting("taskEndTimeField", "Task actual end time field");
		this.textSetting(
			"taskDurationField",
			"Task duration field (minutes, for calendar block height)",
		);
		this.textSetting("taskCompletedDateField", "Task completed date field");
		this.textSetting("taskTrackedMinutesField", "Task tracked minutes field");
		this.textSetting("taskTitleField", "Task title field");
		this.textSetting("taskNoteYamlStatusOpen", "Task note status when open (vault fallback)");
		this.textSetting("taskNoteYamlStatusDone", "Task note status when done (vault fallback)");
		this.textSetting("meetingDateField", "Meeting date field");
		new Setting(containerEl)
			.setName("Meeting start time field")
			.setDesc(
				"Optional. When set, used for date+time (enables hourly blocks in calendar). Leave empty to use date field only.",
			)
			.addText((t) =>
				t
					.setPlaceholder("e.g. startTime")
					.setValue(this.plugin.settings.meetingStartTimeField ?? "")
					.onChange(async (v) => {
						this.plugin.settings.meetingStartTimeField = v;
						await this.plugin.saveSettings();
						this.plugin.vaultIndex.scheduleRebuild();
					}),
			);
		new Setting(containerEl)
			.setName("Meeting end time field")
			.setDesc(
				"Optional. When set with start time, duration is computed from end − start. Otherwise uses duration field.",
			)
			.addText((t) =>
				t
					.setPlaceholder("e.g. endTime")
					.setValue(this.plugin.settings.meetingEndTimeField ?? "")
					.onChange(async (v) => {
						this.plugin.settings.meetingEndTimeField = v;
						await this.plugin.saveSettings();
						this.plugin.vaultIndex.scheduleRebuild();
					}),
			);
		this.textSetting("meetingDurationField", "Meeting duration field");
		this.textSetting("meetingTotalMinutesField", "Meeting total minutes field");
		this.textSetting("meetingTitleField", "Meeting title field");
		new Setting(containerEl)
			.setName("Meeting organizer field")
			.setDesc(
				"On notes under the meetings folder, companion chrome lists this person first. If they also appear elsewhere in frontmatter, the duplicate card is omitted.",
			)
			.addText((t) =>
				t
					.setPlaceholder("organizer")
					.setValue(this.plugin.settings.meetingOrganizerField)
					.onChange(async (v) => {
						this.plugin.settings.meetingOrganizerField = v;
						await this.plugin.saveSettings();
					}),
			);

		heading(containerEl, "Tasks");
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
					.setValue(this.plugin.settings.taskSourceMode)
					.onChange(async (v) => {
						this.plugin.settings.taskSourceMode = v as FulcrumSettings["taskSourceMode"];
						await this.plugin.saveSettings();
						this.plugin.vaultIndex.scheduleRebuild();
					}),
			);
		this.textAreaSetting(
			"taskNotesFolderPaths",
			"Task notes folders",
			"Vault-relative paths, one per line or comma-separated. Empty = entire vault.",
		);
		this.textAreaSetting(
			"obsidianTasksFolderPaths",
			"Inline task folders",
			"Only markdown files under these paths are scanned for - [ ] tasks. Empty = entire vault.",
		);
		this.textSetting("inlineTaskRegex", "Inline task filter (regex, optional)");
		new Setting(containerEl)
			.setName("Tasks plugin integration")
			.setDesc("Reserved for tasks plugin API detection.")
			.addDropdown((d) =>
				d
					.addOptions({
						"auto-detect": "Auto-detect",
						off: "Off",
						force: "Force",
					})
					.setValue(this.plugin.settings.tasksPluginMode)
					.onChange(async (v) => {
						this.plugin.settings.tasksPluginMode = v as FulcrumSettings["tasksPluginMode"];
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("TaskNotes HTTP API")
			.setDesc(
				"Desktop only. When enabled, Fulcrum can call TaskNotes’ local server (e.g. toggle-status). Enable the API in TaskNotes → Integrations. Docs: https://tasknotes.dev/HTTP_API/",
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.taskNotesHttpApiEnabled).onChange(async (v) => {
					this.plugin.settings.taskNotesHttpApiEnabled = v;
					await this.plugin.saveSettings();
				}),
			);
		this.textSetting("taskNotesHttpApiBaseUrl", "TaskNotes API base URL");
		const tokenRow = new Setting(containerEl).setName("TaskNotes API token (optional)");
		tokenRow.addText((tx) => {
			tx.inputEl.type = "password";
			tx.setPlaceholder("Bearer token if set in TaskNotes").setValue(
				this.plugin.settings.taskNotesHttpApiToken,
			);
			tx.onChange(async (v) => {
				this.plugin.settings.taskNotesHttpApiToken = v;
				await this.plugin.saveSettings();
			});
		});
		tokenRow.addButton((b) =>
			b.setButtonText("Test connection").onClick(async () => {
				b.setDisabled(true);
				const ac = new AbortController();
				const to = window.setTimeout(() => ac.abort(), 10_000);
				try {
					const r = await getTaskNotesHealth(
						this.plugin.settings.taskNotesHttpApiBaseUrl,
						this.plugin.settings.taskNotesHttpApiToken || undefined,
						ac.signal,
					);
					new Notice(r.ok ? "TaskNotes API reachable." : (r.error ?? "TaskNotes API check failed."));
				} finally {
					window.clearTimeout(to);
					b.setDisabled(false);
				}
			}),
		);

		heading(containerEl, "Status & priority vocab");
		this.textSetting("taskTag", "Task tag (YAML tags array)");
		this.textSetting("taskStatuses", "Task statuses (comma-separated)");
		this.textSetting("projectStatuses", "Project statuses (comma-separated)");
		this.textSetting("priorities", "Priorities (comma-separated)");
		this.textSetting("taskDoneStatuses", "Task done statuses (comma-separated)");
		this.textSetting("projectActiveStatuses", "Project active statuses (comma-separated)");
		this.textSetting("projectDoneStatuses", "Project done / inactive statuses (comma-separated)");

		heading(containerEl, "Project page");
		this.textSetting("projectLaunchDateField", "Launch / target date field");
		this.textSetting("projectLastReviewedField", "Last reviewed field");
		this.textSetting("projectReviewFrequencyField", "Review frequency field (days)");
		this.textSetting("projectNextReviewField", "Next review field");
		this.textSetting("projectJiraField", "External link field (e.g. Jira)");
		this.textSetting("projectBannerField", "Banner image field");
		this.textSetting("projectColorField", "Project color field");
		this.textSetting("projectRelatedPeopleField", "Related people field");
		new Setting(containerEl)
			.setName("People folder")
			.setDesc(
				"When set, people linked from related notes and tasks are included. Leave empty to only show people from project frontmatter.",
			)
			.addText((t) =>
				t
					.setPlaceholder("e.g. 10 People")
					.setValue(this.plugin.settings.peopleFolder)
					.onChange(async (v) => {
						this.plugin.settings.peopleFolder = v;
						await this.plugin.saveSettings();
						this.plugin.vaultIndex.scheduleRebuild();
					}),
			);
		new Setting(containerEl)
			.setName("People avatar field")
			.setDesc("Frontmatter key on people notes for avatar image. Used when people folder is set.")
			.addText((t) =>
				t
					.setPlaceholder("avatar")
					.setValue(this.plugin.settings.peopleAvatarField)
					.onChange(async (v) => {
						this.plugin.settings.peopleAvatarField = v;
						await this.plugin.saveSettings();
						this.plugin.vaultIndex.scheduleRebuild();
					}),
			);
		this.textSetting("projectRankField", "Project rank field (number; higher = more important)");
		new Setting(containerEl)
			.setName("Default review frequency (days)")
			.setDesc("Used when the project note has no frequency in frontmatter.")
			.addSlider((sl) =>
				sl
					.setLimits(1, 90, 1)
					.setValue(this.plugin.settings.defaultReviewFrequencyDays)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.defaultReviewFrequencyDays = v;
						await this.plugin.saveSettings();
					}),
			);
		this.textAreaSetting(
			"atomicNoteFolderPrefixes",
			"Atomic note folder prefixes",
			"One folder per line or comma-separated. Matches that path plus the current year (e.g. 60 Logs → 60 Logs/2026/…).",
		);
		new Setting(containerEl)
			.setName("Linked note title field")
			.setDesc("Frontmatter key and inline key:: for the primary line on project linked notes (often entry).")
			.addText((t) =>
				t.setValue(this.plugin.settings.atomicNoteEntryField).onChange(async (v) => {
					this.plugin.settings.atomicNoteEntryField = v;
					await this.plugin.saveSettings();
					this.plugin.vaultIndex.scheduleRebuild();
				}),
			);
		this.textSetting("projectLogSectionHeading", "Project log section heading");
		new Setting(containerEl)
			.setName("Project log preview lines")
			.setDesc(
				"How many recent log bullets to read from the project note (tail of the log section). Feeds the Activity view and refresh after append.",
			)
			.addSlider((sl) =>
				sl
					.setLimits(3, 30, 1)
					.setValue(this.plugin.settings.projectLogPreviewMaxLines)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.projectLogPreviewMaxLines = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("New note from template — template path")
			.setDesc(
				"Vault path to a markdown note whose contents are copied for each new note. Leave empty to hide “New note” on project pages. Templater or core template syntax in the file is left as-is for those plugins to process after open.",
			)
			.addText((t) =>
				t
					.setPlaceholder("e.g. Templates/Project scratchpad.md")
					.setValue(this.plugin.settings.projectNewNoteTemplatePath)
					.onChange(async (v) => {
						this.plugin.settings.projectNewNoteTemplatePath = v;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("New note from template — destination")
			.setDesc(
				"Custom folder may use {{fulcrum_project}}, {{fulcrum_project_slug}}, {{fulcrum_project_link}}, {{fulcrum_project_path}}, and {{date:YYYY-MM-DD}} style tokens.",
			)
			.addDropdown((d) =>
				d
					.addOptions({
						projectFolder: "Same folder as the project note",
						customPath: "Custom folder path",
					})
					.setValue(this.plugin.settings.projectNewNoteDestinationMode)
					.onChange(async (v) => {
						this.plugin.settings.projectNewNoteDestinationMode = v as FulcrumSettings["projectNewNoteDestinationMode"];
						await this.plugin.saveSettings();
						this.display();
					}),
			);
		if (this.plugin.settings.projectNewNoteDestinationMode === "customPath") {
			new Setting(containerEl)
				.setName("New note — custom folder path")
				.setDesc("Vault-relative folder only (no filename). Created if missing.")
				.addText((t) =>
					t
						.setPlaceholder("e.g. 40 Projects/{{fulcrum_project_slug}}/Notes")
						.setValue(this.plugin.settings.projectNewNoteDestinationCustomPath)
						.onChange(async (v) => {
							this.plugin.settings.projectNewNoteDestinationCustomPath = v;
							await this.plugin.saveSettings();
						}),
				);
		}
		new Setting(containerEl)
			.setName("New note — file name pattern")
			.setDesc(
				"File name only (not a path). Same placeholders as the custom folder. If the file exists, a numeric suffix is added before .md.",
			)
			.addText((t) =>
				t
					.setPlaceholder("{{date:YYYY-MM-DD}}-{{fulcrum_project_slug}}.md")
					.setValue(this.plugin.settings.projectNewNoteFileNamePattern)
					.onChange(async (v) => {
						this.plugin.settings.projectNewNoteFileNamePattern = v;
						await this.plugin.saveSettings();
					}),
			);

		heading(containerEl, "Display");
		new Setting(containerEl)
			.setName("Dashboard activity (days)")
			.setDesc(
				"How many days of history to show in the Dashboard Activity section (1–7). The list is also limited to the 80 most recent items.",
			)
			.addSlider((sl) =>
				sl
					.setLimits(1, 7, 1)
					.setValue(this.plugin.settings.globalActivityDisplayDays)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.globalActivityDisplayDays = v;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Project list: group by")
			.setDesc(
				"Dashboard and Project Manager sidebar. None shows a single sorted list. You can also change grouping from the list header.",
			)
			.addDropdown((d) =>
				d
					.addOptions({area: "Area", status: "Status", none: "None"})
					.setValue(this.plugin.settings.dashboardActiveProjectsGroupBy)
					.onChange(async (v) => {
						this.plugin.settings.dashboardActiveProjectsGroupBy = v as FulcrumSettings["dashboardActiveProjectsGroupBy"];
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Project list: sort by")
			.setDesc(
				"Order within each group or the flat list (launch and next review use your project page date fields; name is alphabetical).",
			)
			.addDropdown((d) =>
				d
					.addOptions({
						launch: "Launch date",
						nextReview: "Next review",
						rank: "Rank",
						name: "Name",
					})
					.setValue(this.plugin.settings.projectSidebarSortBy)
					.onChange(async (v) => {
						this.plugin.settings.projectSidebarSortBy = v as FulcrumSettings["projectSidebarSortBy"];
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Project list: sort direction")
			.setDesc("Ascending vs descending for the sort above. For rank, descending lists highest (most important) first.")
			.addDropdown((d) =>
				d
					.addOptions({asc: "Ascending", desc: "Descending"})
					.setValue(this.plugin.settings.projectSidebarSortDir)
					.onChange(async (v) => {
						this.plugin.settings.projectSidebarSortDir = v as FulcrumSettings["projectSidebarSortDir"];
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Default project view")
			.addDropdown((d) =>
				d
					.addOptions({summary: "Summary", board: "Board (coming soon)"})
					.setValue(this.plugin.settings.defaultProjectView)
					.onChange(async (v) => {
						this.plugin.settings.defaultProjectView = v as FulcrumSettings["defaultProjectView"];
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Open views in")
			.addDropdown((d) =>
				d
					.addOptions({main: "Main area (new tab)", sidebar: "Right sidebar"})
					.setValue(this.plugin.settings.openViewsIn)
					.onChange(async (v) => {
						this.plugin.settings.openViewsIn = v as FulcrumSettings["openViewsIn"];
						await this.plugin.saveSettings();
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
					.setValue(this.plugin.settings.hoverPreviewDelayMs)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.hoverPreviewDelayMs = v;
						await this.plugin.saveSettings();
					}),
			);
		this.toggleSetting("showRibbonIcon", "Show dashboard ribbon icon");
		this.textSetting("dateDisplayFormat", "Date display format (reserved)");
		new Setting(containerEl)
			.setName("Calendar: first day of week")
			.addDropdown((d) =>
				d
					.addOptions({"0": "Sunday", "1": "Monday", "6": "Saturday"})
					.setValue(String(this.plugin.settings.calendarFirstDayOfWeek))
					.onChange(async (v) => {
						this.plugin.settings.calendarFirstDayOfWeek = Number(v);
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Completion threshold %")
			.setDesc("Used later for project health.")
			.addSlider((sl) =>
				sl
					.setLimits(0, 100, 5)
					.setValue(this.plugin.settings.completionThresholdPercent)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.completionThresholdPercent = v;
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl("p", {
			cls: "fulcrum-settings-lead",
			text: "Install into a vault: add a repo-root file fulcrum-vault.path with your vault path (see fulcrum-vault.path.example), then npm run build:install — or pass the path after -- : npm run build:install -- \"/path/to/Vault\"",
		});
	}

	private textAreaSetting<K extends keyof FulcrumSettings>(
		key: K,
		name: string,
		desc?: string,
	): void {
		const row = new Setting(this.containerEl).setName(name);
		if (desc) row.setDesc(desc);
		const v = this.plugin.settings[key];
		const str = typeof v === "string" ? v : String(v);
		row.addTextArea((ta) => {
			ta.inputEl.rows = 5;
			ta.setValue(str).onChange(async (value) => {
				(this.plugin.settings as unknown as Record<string, unknown>)[key as string] = value;
				await this.plugin.saveSettings();
				this.plugin.vaultIndex.scheduleRebuild();
			});
		});
	}

	private textSetting<K extends keyof FulcrumSettings>(key: K, name: string, desc?: string): void {
		const v = this.plugin.settings[key];
		const str = typeof v === "string" ? v : String(v);
		const row = new Setting(this.containerEl).setName(name);
		if (desc) row.setDesc(desc);
		row.addText((t) =>
			t.setValue(str).onChange(async (value) => {
				(this.plugin.settings as unknown as Record<string, unknown>)[key as string] = value;
				await this.plugin.saveSettings();
				this.plugin.vaultIndex.scheduleRebuild();
			}),
		);
	}

	private toggleSetting<K extends keyof FulcrumSettings>(
		key: K,
		name: string,
		desc?: string,
	): void {
		const row = new Setting(this.containerEl).setName(name);
		if (desc) row.setDesc(desc);
		row.addToggle((tg) =>
			tg.setValue(Boolean(this.plugin.settings[key])).onChange(async (value) => {
				(this.plugin.settings as unknown as Record<string, unknown>)[key as string] = value;
				await this.plugin.saveSettings();
				this.plugin.vaultIndex.scheduleRebuild();
			}),
		);
	}
}

