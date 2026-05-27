import type {TimerSettings} from "../timer/settings";
import {DEFAULT_TIMER_SETTINGS} from "../timer/settings";
import type {TimeModeTab} from "../timer/types";

export type TaskSourceMode = "taskNotes" | "obsidianTasks" | "both";

/** Inline / vault tasks indexed without a [[project]] link. */
export type TaskIndexScope = "projectLinked" | "all";
export type ProjectStatusIndication = "frontmatter" | "subfolder";
export type ProjectSidebarSortBy = "launch" | "nextReview" | "rank" | "name";
export type ProjectSidebarSortDir = "asc" | "desc";

export type KanbanView = "projects" | "tasks";
export type KanbanDimension = "area" | "project" | "status" | "date";
export type KanbanSwimlaneDimension = "none" | KanbanDimension;
export type KanbanProjectDateSource = "nextReview" | "deadline";

/** Saved time-tracked dashboard range. */
export type TimeTrackerHorizon = "all" | "7d" | "30d" | "90d";

/** Where “new note from template” saves relative to the project. */
export type ProjectNewNoteDestinationMode = "projectFolder" | "customPath";

/** Dashboard “Activity” section: maximum calendar days of history. */
export const DASHBOARD_ACTIVITY_MAX_DAYS = 7 as const;

/** After filtering by date, cap rows so the feed stays scannable. */
export const DASHBOARD_ACTIVITY_MAX_ROWS = 80 as const;

export interface FulcrumSettings {
	/** Legacy combined root; used when optional folders below are empty. */
	areasProjectsFolder: string;
	/**
	 * When set, only notes under this path are indexed as areas (type = area value).
	 * Empty → use `areasProjectsFolder` (single-folder mode).
	 */
	areasFolder: string;
	/**
	 * When set, only notes under this path are indexed as projects.
	 * Empty → use `areasProjectsFolder`.
	 */
	projectsFolder: string;
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
	/** Frontmatter key for meeting organizer (people link); companion chrome lists them first on meeting notes. */
	meetingOrganizerField: string;

	taskSourceMode: TaskSourceMode;
	/** Multi-line or comma-separated; empty = whole vault. */
	taskNotesFolderPaths: string;
	obsidianTasksFolderPaths: string;
	inlineTaskRegex: string;
	tasksPluginMode: "auto-detect" | "off" | "force";
	/** Inline checkbox tasks: require project link vs index all in scanned folders. */
	taskIndexScope: TaskIndexScope;

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
	/** Kanban view: projects or tasks board */
	kanbanView: KanbanView;
	kanbanColumnBy: KanbanDimension;
	kanbanSwimlaneBy: KanbanSwimlaneDimension;
	/** When Date dimension is used for projects: next review vs deadline field */
	kanbanProjectDateSource: KanbanProjectDateSource;
	/** Hidden column IDs keyed by `${view}:${dimension}` e.g. projects:status */
	kanbanHiddenColumns: Record<string, string[]>;
	/** Column order keyed by `${view}:${dimension}` */
	kanbanColumnOrder: Record<string, string[]>;
	/** @deprecated migrated to kanbanHiddenColumns */
	kanbanHiddenStatus: string[];
	/** @deprecated migrated to kanbanHiddenColumns */
	kanbanHiddenArea: string[];
	/** @deprecated migrated to kanbanColumnOrder */
	kanbanOrderStatus: string[];
	/** @deprecated migrated to kanbanColumnOrder */
	kanbanOrderArea: string[];
	/** Calendar view mode */
	calendarViewMode: "month" | "workWeek" | "week" | "threeDay" | "day";
	showRibbonIcon: boolean;
	dateDisplayFormat: string;
	completionThresholdPercent: number;
	dashboardActiveProjectsGroupBy: "area" | "status" | "reviewDue" | "none";
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
	projectDeadlineField: string;
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

	/** Dashboard activity feed: days of history (1–7; see DASHBOARD_ACTIVITY_MAX_DAYS). */
	globalActivityDisplayDays: number;

	/** Time tracked view: last selected horizon. */
	timeTrackerHorizon: TimeTrackerHorizon;
	/** Area note paths excluded from the time dashboard (empty = all areas on). */
	timeTrackerExcludedAreaPaths: string[];

	/** 0 = Sunday, 1 = Monday (default). */
	calendarFirstDayOfWeek: number;

	/** Built-in timer / time-tracking (merged from Lapse). */
	timer: TimerSettings;
	/** Last selected tab in Project Manager → Time mode. */
	timeModeTab: TimeModeTab;

	/** Sync timer state to Fulcrum/.widget-bridge.json for native widgets. */
	widgetBridgeEnabled: boolean;
	/** Vault-relative path to the widget bridge JSON file. */
	widgetBridgePath: string;
	/** Stable id for this Obsidian instance when reconciling bridge commands. */
	widgetBridgeDeviceId: string;

	/** Timeline: show time blocks from daily notes under planner heading. */
	timelineDailyPlannerEnabled: boolean;
	/** Heading text (exact match) for planner section; empty = whole daily note. */
	plannerHeading: string;
	/** Default block height (minutes) for timed planner lines without an end time. */
	plannerDefaultDurationMinutes: number;
}

/** Root path for area notes (separate from projects when `areasFolder` is set). */
export function resolveAreasRoot(s: FulcrumSettings): string {
	return s.areasFolder.trim() || s.areasProjectsFolder.trim();
}

/** Root path for project notes (separate from areas when `projectsFolder` is set). */
export function resolveProjectsRoot(s: FulcrumSettings): string {
	return s.projectsFolder.trim() || s.areasProjectsFolder.trim();
}

export const DEFAULT_SETTINGS: FulcrumSettings = {
	areasProjectsFolder: "40 Projects",
	areasFolder: "",
	projectsFolder: "",
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
	meetingOrganizerField: "organizer",

	taskSourceMode: "both",
	taskNotesFolderPaths: "35 Tasks/TaskNotes",
	obsidianTasksFolderPaths: "",
	inlineTaskRegex: "",
	tasksPluginMode: "auto-detect",
	taskIndexScope: "projectLinked",

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
	kanbanView: "projects",
	kanbanColumnBy: "status",
	kanbanSwimlaneBy: "none",
	kanbanProjectDateSource: "nextReview",
	kanbanHiddenColumns: {},
	kanbanColumnOrder: {},
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
	projectDeadlineField: "deadline",
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

	timer: {...DEFAULT_TIMER_SETTINGS},
	timeModeTab: "overview",

	widgetBridgeEnabled: true,
	widgetBridgePath: "Fulcrum/.widget-bridge.json",
	widgetBridgeDeviceId: "",

	timelineDailyPlannerEnabled: true,
	plannerHeading: "Day planner",
	plannerDefaultDurationMinutes: 30,
};

export function parseList(s: string): string[] {
	return s
		.split(",")
		.map((x) => x.trim().toLowerCase())
		.filter(Boolean);
}
