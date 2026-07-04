import type {TimerSettings} from "../timer/settings";
import {DEFAULT_TIMER_SETTINGS} from "../timer/settings";
import type {TimeModeTab} from "../timer/types";
import type {IndexedProject} from "./types";
import {isUnderFolder} from "./utils/paths";

export type TaskSourceMode = "taskNotes" | "obsidianTasks" | "both";

/** Inline / vault tasks indexed without a [[project]] link. */
export type TaskIndexScope = "projectLinked" | "all";
export type ProjectStatusIndication = "frontmatter" | "subfolder";
export type ProjectSidebarSortBy = "launch" | "nextReview" | "rank" | "name";
export type ProjectSidebarSortDir = "asc" | "desc";
export type TaskSidebarGroupBy = "area" | "status" | "project" | "none";
export type TaskSidebarSortBy = "due" | "name" | "project";

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

export type CalendarTaskScheduleField = "due" | "scheduled" | "ask";

export type TasksViewGroupBy = "day" | "project" | "tag";

export type TasksViewColumnId =
	| "title"
	| "project"
	| "scheduled"
	| "due"
	| "tags"
	| "status"
	| "priority";

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
	/** Area note frontmatter: life context grouping (Work, Personal, Professional, Freelance). */
	areaLifeModeField: string;
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
	/** TaskNotes-compatible extended fields (property key remapping). */
	taskRecurrenceField: string;
	taskRemindersField: string;
	taskRecurrenceAnchorField: string;
	taskCompleteInstancesField: string;
	taskSkippedInstancesField: string;
	taskProjectsField: string;
	taskRecurrenceParentField: string;
	taskOccurrenceDateField: string;
	/** Cached next N occurrence dates for recurring tasks. */
	taskNextOccurrencesField: string;
	/** Maintain due/scheduled offset when recurring task rolls forward. */
	recurrenceMaintainDueOffset: boolean;
	/** Only index inline checkboxes containing this tag (empty = no tag filter). */
	inlineTaskIncludeTag: string;
	taskNoteDefaultFolder: string;
	taskNoteFilenamePattern: string;
	taskNoteBodyTemplatePath: string;
	/** Hide the configured task tag in card/pill metadata display. */
	taskSuppressDesignatedTagInDisplay: boolean;
	taskNoteCardShowScheduled: boolean;
	taskNoteCardShowDue: boolean;
	taskNoteCardShowProject: boolean;
	taskNoteCardShowTags: boolean;
	inlineTaskShowScheduled: boolean;
	inlineTaskShowDue: boolean;
	inlineTaskShowProject: boolean;
	inlineTaskShowTags: boolean;
	taskCardShowSubtaskCount: boolean;
	taskCardShowRecurrenceIndicator: boolean;
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
	/** Include/exclude paths and `!file:` basename rules; see settings UI. */
	inlineTaskRegex: string;
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
	/** Calendar view mode */
	calendarViewMode: "month" | "workWeek" | "week" | "threeDay" | "day";
	/** Default date field when dragging unscheduled tasks onto the calendar. */
	calendarTaskScheduleField: CalendarTaskScheduleField;
	showRibbonIcon: boolean;
	dashboardActiveProjectsGroupBy: "area" | "status" | "reviewDue" | "none";
	projectSidebarSortBy: ProjectSidebarSortBy;
	projectSidebarSortDir: ProjectSidebarSortDir;
	/** Project sidebar filter: unchecked status keys (empty = all checked). Use __none__ for no status. */
	projectSidebarFilterUncheckedStatus: string[];
	/** Calendar / Kanban tasks sidebar: group open tasks by area, status, project, or flat. */
	taskSidebarGroupBy: TaskSidebarGroupBy;
	taskSidebarSortBy: TaskSidebarSortBy;
	taskSidebarSortDir: ProjectSidebarSortDir;
	/** Task sidebar filter: unchecked status keys (empty = all checked). */
	taskSidebarFilterUncheckedStatus: string[];
	/** Task sidebar filter: unchecked project file paths. Use __none__ for no project. */
	taskSidebarFilterUncheckedProject: string[];

	/** Tasks view: center list grouping */
	tasksViewGroupBy: TasksViewGroupBy;
	/** Tasks view: visible columns in center grid (order matters). */
	tasksViewColumns: TasksViewColumnId[];
	/** Tasks view: number of future day sections after today. */
	tasksViewFutureDays: number;

	projectStatusIndication: ProjectStatusIndication;
	projectStatusField: string;

	/** Frontmatter key for project end date (timeline / sidebar). */
	projectEndDateField: string;
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
	/** `##` section in project notes listing `YYYY-MM-DD: label` milestones for the gantt. */
	projectMilestonesSectionHeading: string;
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
	/** Project frontmatter field for related project wikilinks (e.g. relatedProjects). */
	projectRelatedProjectsField: string;
	/** Project frontmatter field for related product wikilinks (e.g. relatedProducts). */
	projectRelatedProductsField: string;
	/** People directories (vault paths). Source of truth for pills, related people, and Orbit. */
	peopleDirs: string[];
	/** @deprecated Migrated to peopleDirs on load. */
	peopleFolder?: string;
	/** Orbit: avatar display style on person profiles and list rows. */
	avatarStyle: "circle" | "cover" | "thumbnail";
	/** Orbit: banner color when person note has no `color` frontmatter. */
	defaultBannerColor: string;
	/** Orbit: primary frontmatter key for interaction dates. */
	orbitDateField: string;
	/** Orbit: secondary frontmatter key for interaction timestamps. */
	orbitStartTimeField: string;
	/** Orbit: inline metadata key stripped from activity preview excerpts. */
	orbitActivityPreviewEntryField: string;
	/** Orbit: max content lines per activity preview card. */
	orbitActivityPreviewMaxLines: number;
	/** Orbit: heatmap first day of week (0 = Sunday … 6 = Saturday). */
	orbitFirstDayOfWeek: number;
	/** Products directory: notes under this path become product inline pills when linked. */
	productsFolder: string;
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

	/** Tabled: native widget bridge — use Open Floating Timers View instead. */
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

	conduitEnabled: boolean;
	conduitRemctlPath: string;
	conduitInboxListName: string;
	conduitReminderListIdField: string;
	conduitListArchivedField: string;
	conduitArchivedListPrefix: string;
	/** Apply project frontmatter color to the matching Reminders list. */
	conduitSyncListColors: boolean;
	/** HTTP bridge URL (Fulcrum Bridge app). Empty = remctl only. */
	remindersBridgeUrl: string;
	remindersBridgeToken: string;
	taskNotesArchiveFolder: string;
	remindersQueryRefreshSeconds: number;
	remindersCalendarIds: string;
	/** Forecast: comma-separated macOS calendar IDs to show (independent of Calendar view). */
	forecastCalendarIds: string;
	/** Forecast: show vault meeting notes in the day-grouped center list. */
	forecastShowVaultMeetings: boolean;
	/** Forecast: show system calendar events from Fulcrum Bridge. */
	forecastShowSystemCalendars: boolean;

	/** Quick note themes for project page segmented submit (emoji, type, journal). */
	quickNoteThemes: QuickNoteTheme[];
}

/** Configurable theme for themed project quick notes (inline fields in Fulcrum log). */
export interface QuickNoteTheme {
	id: string;
	label: string;
	emoji: string;
	/** Value for inline `type::` (defaults to `${emoji} ${label}` when empty). */
	type: string;
	journal?: string;
}

export const DEFAULT_QUICK_NOTE_THEMES: QuickNoteTheme[] = [
	{id: "communication", label: "Communication", emoji: "☎️", type: "☎️ Communication", journal: "Work"},
	{id: "challenge", label: "Challenge", emoji: "🧗", type: "🧗 Challenge", journal: "Work"},
	{id: "intention", label: "Intention", emoji: "🎯", type: "🎯 Intention", journal: "Work"},
	{id: "big-win", label: "Big Win", emoji: "🏆", type: "🏆 Big Win", journal: "Work"},
];

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
	areaLifeModeField: "life-mode",
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
	taskRecurrenceField: "recurrence",
	taskRemindersField: "reminders",
	taskRecurrenceAnchorField: "recurrence_anchor",
	taskCompleteInstancesField: "complete_instances",
	taskSkippedInstancesField: "skipped_instances",
	taskProjectsField: "projects",
	taskRecurrenceParentField: "recurrence_parent",
	taskOccurrenceDateField: "occurrence_date",
	taskNextOccurrencesField: "next_occurrences",
	recurrenceMaintainDueOffset: false,
	inlineTaskIncludeTag: "task",
	taskNoteDefaultFolder: "",
	taskNoteFilenamePattern: "{{title}}",
	taskNoteBodyTemplatePath: "",
	taskSuppressDesignatedTagInDisplay: true,
	taskNoteCardShowScheduled: true,
	taskNoteCardShowDue: true,
	taskNoteCardShowProject: true,
	taskNoteCardShowTags: true,
	inlineTaskShowScheduled: true,
	inlineTaskShowDue: true,
	inlineTaskShowProject: true,
	inlineTaskShowTags: true,
	taskCardShowSubtaskCount: true,
	taskCardShowRecurrenceIndicator: true,
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

	openViewsIn: "main",
	kanbanView: "projects",
	kanbanColumnBy: "status",
	kanbanSwimlaneBy: "none",
	kanbanProjectDateSource: "nextReview",
	kanbanHiddenColumns: {},
	kanbanColumnOrder: {},
	calendarViewMode: "week",
	calendarTaskScheduleField: "ask",
	showRibbonIcon: true,
	dashboardActiveProjectsGroupBy: "area",
	projectSidebarSortBy: "launch",
	projectSidebarSortDir: "asc",
	projectSidebarFilterUncheckedStatus: [],
	taskSidebarGroupBy: "area",
	taskSidebarSortBy: "due",
	taskSidebarSortDir: "asc",
	taskSidebarFilterUncheckedStatus: [],
	taskSidebarFilterUncheckedProject: [],
	tasksViewGroupBy: "day",
	tasksViewColumns: ["title", "project", "scheduled", "due", "tags"],
	tasksViewFutureDays: 14,

	projectStatusIndication: "frontmatter",
	projectStatusField: "status",

	projectEndDateField: "endDate",
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
	projectMilestonesSectionHeading: "## Milestones",
	projectLogPreviewMaxLines: 12,

	projectNewNoteTemplatePath: "",
	projectNewNoteDestinationMode: "projectFolder",
	projectNewNoteDestinationCustomPath: "",
	projectNewNoteFileNamePattern: "{{date:YYYY-MM-DD}}-{{fulcrum_project_slug}}.md",

	projectBannerField: "banner",
	projectColorField: "color",

	projectRelatedPeopleField: "relatedPeople",
	projectRelatedProjectsField: "relatedProjects",
	projectRelatedProductsField: "relatedProducts",
	peopleDirs: [],
	avatarStyle: "circle",
	defaultBannerColor: "#2a2a2a",
	orbitDateField: "date",
	orbitStartTimeField: "startTime",
	orbitActivityPreviewEntryField: "entry",
	orbitActivityPreviewMaxLines: 10,
	orbitFirstDayOfWeek: 0,
	productsFolder: "",
	peopleAvatarField: "avatar",

	hoverPreviewDelayMs: 1500,

	globalActivityDisplayDays: 7,

	timeTrackerHorizon: "30d",
	timeTrackerExcludedAreaPaths: [],

	calendarFirstDayOfWeek: 1,

	timer: {...DEFAULT_TIMER_SETTINGS},
	timeModeTab: "overview",

	widgetBridgeEnabled: false,
	widgetBridgePath: "Fulcrum/.widget-bridge.json",
	widgetBridgeDeviceId: "",

	timelineDailyPlannerEnabled: true,
	plannerHeading: "Day planner",
	plannerDefaultDurationMinutes: 30,

	/** macOS: Apple Reminders bridge (live views + convert). */
	conduitEnabled: false,
	conduitRemctlPath: "",
	conduitInboxListName: "Fulcrum Inbox",
	conduitReminderListIdField: "appleReminderListId",
	conduitListArchivedField: "conduitListArchived",
	conduitArchivedListPrefix: "✓ ",
	conduitSyncListColors: true,
	remindersBridgeUrl: "http://127.0.0.1:9247",
	remindersBridgeToken: "",
	taskNotesArchiveFolder: "35 Tasks/TaskNotes/Archive",
	remindersQueryRefreshSeconds: 0,
	remindersCalendarIds: "",
	forecastCalendarIds: "",
	forecastShowVaultMeetings: true,
	forecastShowSystemCalendars: false,

	quickNoteThemes: [...DEFAULT_QUICK_NOTE_THEMES],
};

export function parseList(s: string): string[] {
	return s
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);
}

/** Case-insensitive key for matching configured status tokens. */
export function normalizeStatusKey(status: string): string {
	return status.trim().toLowerCase();
}

export function parseDoneStatusSet(statusesCsv: string): Set<string> {
	return new Set(parseList(statusesCsv).map(normalizeStatusKey));
}

export function isDoneStatus(status: string, doneSet: Set<string>): boolean {
	return doneSet.has(normalizeStatusKey(status));
}

/** Case-insensitive done/inactive project statuses from settings CSV. */
export function parseDoneProjectStatusSet(statusesCsv: string): Set<string> {
	return parseDoneStatusSet(statusesCsv);
}

/** True when project status is done or the note lives under `completedProjectsFolder`. */
export function isProjectDone(project: IndexedProject, settings: FulcrumSettings): boolean {
	const doneSet = parseDoneProjectStatusSet(settings.projectDoneStatuses);
	if (isDoneStatus(project.status ?? "", doneSet)) return true;
	const completedRoot = settings.completedProjectsFolder.trim();
	if (completedRoot && isUnderFolder(project.file.path, completedRoot)) return true;
	return false;
}

export const DEFAULT_TASK_STATUSES = "todo, in-progress, done, cancelled";

/** Parsed task status choices with fallback when settings are empty or invalid. */
export function parseTaskStatusChoices(settings: FulcrumSettings): string[] {
	const raw = settings.taskStatuses?.trim();
	const list = parseList(raw || DEFAULT_TASK_STATUSES);
	return list.length > 0 ? list : parseList(DEFAULT_TASK_STATUSES);
}

/** Migrate legacy task card display settings to metadata toggles. */
export function migrateTaskCardDisplaySettings(
	merged: FulcrumSettings & Record<string, unknown>,
): void {
	const legacyTags = merged.taskCardShowTags;
	if (typeof merged.taskNoteCardShowTags !== "boolean" && typeof legacyTags === "boolean") {
		merged.taskNoteCardShowTags = legacyTags;
		merged.inlineTaskShowTags = legacyTags;
	}
	const boolFields = [
		"taskSuppressDesignatedTagInDisplay",
		"taskNoteCardShowScheduled",
		"taskNoteCardShowDue",
		"taskNoteCardShowProject",
		"taskNoteCardShowTags",
		"inlineTaskShowScheduled",
		"inlineTaskShowDue",
		"inlineTaskShowProject",
		"inlineTaskShowTags",
	] as const;
	for (const key of boolFields) {
		if (typeof merged[key] !== "boolean") {
			merged[key] = DEFAULT_SETTINGS[key];
		}
	}
	if (typeof merged.taskCardShowSubtaskCount !== "boolean") {
		merged.taskCardShowSubtaskCount = DEFAULT_SETTINGS.taskCardShowSubtaskCount;
	}
	if (typeof merged.taskCardShowRecurrenceIndicator !== "boolean") {
		merged.taskCardShowRecurrenceIndicator = DEFAULT_SETTINGS.taskCardShowRecurrenceIndicator;
	}
	delete merged.taskCardShowCreatedAge;
	delete merged.taskCardShowTags;
	delete merged.taskCardInlineIcon;
	delete merged.showInlineSourceNoteOnCard;
	delete merged.inlineTaskCardVariant;
	if (merged.inlineTaskIncludeTag === "Tasks") {
		merged.inlineTaskIncludeTag = "task";
	}
}
