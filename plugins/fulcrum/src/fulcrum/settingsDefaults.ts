export type TaskSourceMode = "taskNotes" | "obsidianTasks" | "both";
export type ProjectStatusIndication = "frontmatter" | "subfolder";
export type ProjectSidebarSortBy = "launch" | "nextReview" | "rank" | "name";
export type ProjectSidebarSortDir = "asc" | "desc";

/** Saved time-tracked dashboard range. */
export type TimeTrackerHorizon = "all" | "7d" | "30d" | "90d";

/** Where “new note from template” saves relative to the project. */
export type ProjectNewNoteDestinationMode = "projectFolder" | "customPath";

export interface FulcrumSettings {
	areasProjectsFolder: string;
	meetingsFolder: string;
	completedProjectsFolder: string;
	/** When true, markdown under the areas/projects folder is a project unless `type` is the area value. */
	inferProjectsInAreasFolder: boolean;

	typeField: string;
	areaTypeValue: string;
	projectTypeValue: string;
	projectLinkField: string;
	areaLinkField: string;
	taskStatusField: string;
	taskPriorityField: string;
	taskDueDateField: string;
	taskScheduledDateField: string;
	/** Actual work window on the task note; calendar uses before scheduled. */
	taskStartTimeField: string;
	taskEndTimeField: string;
	/** Planned duration (minutes) for timed calendar blocks when scheduled has a time. */
	taskDurationField: string;
	taskCompletedDateField: string;
	taskTrackedMinutesField: string;
	taskTitleField: string;
	taskNoteYamlStatusOpen: string;
	taskNoteYamlStatusDone: string;
	meetingDateField: string;
	/** Optional. When set, used for date+time (hourly placement). Falls back to meetingDateField when empty. */
	meetingStartTimeField: string;
	/** Optional. When set and start has time, duration = end - start. Otherwise use meetingDurationField. */
	meetingEndTimeField: string;
	meetingDurationField: string;
	meetingTotalMinutesField: string;
	meetingTitleField: string;

	taskSourceMode: TaskSourceMode;
	/** Multi-line or comma-separated; empty = whole vault. */
	taskNotesFolderPaths: string;
	obsidianTasksFolderPaths: string;
	inlineTaskRegex: string;
	tasksPluginMode: "auto-detect" | "off" | "force";

	taskNotesHttpApiEnabled: boolean;
	taskNotesHttpApiBaseUrl: string;
	taskNotesHttpApiToken: string;

	taskTag: string;
	taskStatuses: string;
	projectStatuses: string;
	priorities: string;
	taskDoneStatuses: string;
	projectActiveStatuses: string;
	projectDoneStatuses: string;

	defaultProjectView: "summary" | "board";
	openViewsIn: "main" | "sidebar";
	/** Kanban column grouping */
	kanbanColumnBy: "status" | "area";
	/** Kanban hidden column IDs (per grouping mode) */
	kanbanHiddenStatus: string[];
	kanbanHiddenArea: string[];
	/** Kanban column order (IDs). Empty = natural order. */
	kanbanOrderStatus: string[];
	kanbanOrderArea: string[];
	/** Calendar view mode */
	calendarViewMode: "month" | "workWeek" | "week" | "threeDay" | "day";
	showRibbonIcon: boolean;
	dateDisplayFormat: string;
	completionThresholdPercent: number;
	dashboardActiveProjectsGroupBy: "area" | "status" | "none";
	projectSidebarSortBy: ProjectSidebarSortBy;
	projectSidebarSortDir: ProjectSidebarSortDir;
	/** Project sidebar filter: unchecked status keys (empty = all checked). Use __none__ for no status. */
	projectSidebarFilterUncheckedStatus: string[];
	/** Project sidebar filter: unchecked area keys (empty = all checked). Use __none__ for no area. */
	projectSidebarFilterUncheckedArea: string[];

	projectStatusIndication: ProjectStatusIndication;
	projectStatusField: string;

	/** Frontmatter keys on the project note (review / launch). */
	projectLaunchDateField: string;
	/** Frontmatter key for numeric rank (higher = more important). */
	projectRankField: string;
	projectLastReviewedField: string;
	projectReviewFrequencyField: string;
	projectNextReviewField: string;
	projectJiraField: string;
	/** When project note has no review frequency in frontmatter. */
	defaultReviewFrequencyDays: number;
	/** One vault folder per line or comma-separated; matches `folder/YYYY/...` and `folder/...`. */
	atomicNoteFolderPrefixes: string;
	/** Frontmatter key and inline `key::` for primary line on linked notes. */
	atomicNoteEntryField: string;
	/** Markdown heading Fulcrum creates/uses when appending log lines to the project file. */
	projectLogSectionHeading: string;
	projectLogPreviewMaxLines: number;

	/** Vault path to a markdown note used as the body template for “New note” on project pages. Empty hides the button. */
	projectNewNoteTemplatePath: string;
	projectNewNoteDestinationMode: ProjectNewNoteDestinationMode;
	/** When mode is customPath: vault folder; supports {{fulcrum_project}}, {{fulcrum_project_slug}}, {{fulcrum_project_link}}, {{fulcrum_project_path}}, {{date:…}}. */
	projectNewNoteDestinationCustomPath: string;
	/** New file name pattern (vault-relative file name only); same placeholders as custom path. */
	projectNewNoteFileNamePattern: string;

	projectBannerField: string;
	projectColorField: string;

	/** Project frontmatter field for related people wikilinks (e.g. relatedPeople). */
	projectRelatedPeopleField: string;
	/** People directory: when set, collect people from related notes/tasks; when empty, only project frontmatter. */
	peopleFolder: string;
	/** Frontmatter field on people notes for avatar image (when people directory is set). */
	peopleAvatarField: string;

	/** Delay in ms before showing page preview on hover (0 = instant). */
	hoverPreviewDelayMs: number;

	/** Global activity feed: how many days back to include (Dashboard). */
	globalActivityDisplayDays: number;

	/** Time tracked view: last selected horizon. */
	timeTrackerHorizon: TimeTrackerHorizon;
	/** Area note paths excluded from the time dashboard (empty = all areas on). */
	timeTrackerExcludedAreaPaths: string[];

	/** 0 = Sunday, 1 = Monday (default). */
	calendarFirstDayOfWeek: number;
}

export const DEFAULT_SETTINGS: FulcrumSettings = {
	areasProjectsFolder: "40 Projects",
	meetingsFolder: "30 Work/Meetings",
	completedProjectsFolder: "40 Projects/Completed",
	inferProjectsInAreasFolder: true,

	typeField: "type",
	areaTypeValue: "area",
	projectTypeValue: "project",
	projectLinkField: "project",
	areaLinkField: "area",
	taskStatusField: "status",
	taskPriorityField: "priority",
	taskDueDateField: "dueDate",
	taskScheduledDateField: "scheduled",
	taskStartTimeField: "startTime",
	taskEndTimeField: "endTime",
	taskDurationField: "duration",
	taskCompletedDateField: "completedDate",
	taskTrackedMinutesField: "totalTimeTracked",
	taskTitleField: "title",
	taskNoteYamlStatusOpen: "NONE",
	taskNoteYamlStatusDone: "DONE",
	meetingDateField: "date",
	meetingStartTimeField: "",
	meetingEndTimeField: "",
	meetingDurationField: "duration",
	meetingTotalMinutesField: "totalMinutesTracked",
	meetingTitleField: "entry",

	taskSourceMode: "both",
	taskNotesFolderPaths: "35 Tasks/TaskNotes",
	obsidianTasksFolderPaths: "",
	inlineTaskRegex: "",
	tasksPluginMode: "auto-detect",

	taskNotesHttpApiEnabled: false,
	taskNotesHttpApiBaseUrl: "http://localhost:8080",
	taskNotesHttpApiToken: "",

	taskTag: "task",
	taskStatuses: "todo, in-progress, done, cancelled",
	projectStatuses: "planning, active, on-hold, completed, archived",
	priorities: "high, medium, low",
	taskDoneStatuses: "done, completed",
	projectActiveStatuses: "planning, active, on-hold",
	projectDoneStatuses: "completed, archived",

	defaultProjectView: "summary",
	openViewsIn: "main",
	kanbanColumnBy: "status",
	kanbanHiddenStatus: [],
	kanbanHiddenArea: [],
	kanbanOrderStatus: [],
	kanbanOrderArea: [],
	calendarViewMode: "week",
	showRibbonIcon: true,
	dateDisplayFormat: "YYYY-MM-DD",
	completionThresholdPercent: 100,
	dashboardActiveProjectsGroupBy: "area",
	projectSidebarSortBy: "launch",
	projectSidebarSortDir: "asc",
	projectSidebarFilterUncheckedStatus: [],
	projectSidebarFilterUncheckedArea: [],

	projectStatusIndication: "frontmatter",
	projectStatusField: "status",

	projectLaunchDateField: "launchDate",
	projectRankField: "rank",
	projectLastReviewedField: "lastReviewed",
	projectReviewFrequencyField: "reviewFrequency",
	projectNextReviewField: "nextReview",
	projectJiraField: "jira",
	defaultReviewFrequencyDays: 7,
	atomicNoteFolderPrefixes:
		"60 Logs\n70 Journal/Atomic\n30 Work/Meetings\n30 Work/Notes",
	atomicNoteEntryField: "entry",
	projectLogSectionHeading: "## Fulcrum log",
	projectLogPreviewMaxLines: 12,

	projectNewNoteTemplatePath: "",
	projectNewNoteDestinationMode: "projectFolder",
	projectNewNoteDestinationCustomPath: "",
	projectNewNoteFileNamePattern: "{{date:YYYY-MM-DD}}-{{fulcrum_project_slug}}.md",

	projectBannerField: "banner",
	projectColorField: "color",

	projectRelatedPeopleField: "relatedPeople",
	peopleFolder: "",
	peopleAvatarField: "avatar",

	hoverPreviewDelayMs: 1500,

	globalActivityDisplayDays: 7,

	timeTrackerHorizon: "30d",
	timeTrackerExcludedAreaPaths: [],

	calendarFirstDayOfWeek: 1,
};

export function parseList(s: string): string[] {
	return s
		.split(",")
		.map((x) => x.trim().toLowerCase())
		.filter(Boolean);
}
