import type {TFile} from "obsidian";

export interface IndexedArea {
	file: TFile;
	name: string;
	status?: string;
	color?: string;
	icon?: string;
	description?: string;
	/** From area note frontmatter `work-related` / `workRelated`. */
	workRelated?: boolean;
	/** Life context from `life-mode` (or configured field); e.g. Work, Personal. */
	lifeMode?: string;
}

export interface IndexedProject {
	file: TFile;
	name: string;
	status: string;
	priority?: string;
	startDate?: string;
	dueDate?: string;
	completedDate?: string;
	/** Primary area (first linked); same as areaFiles[0] when non-empty. */
	areaFile: TFile | null;
	areaName?: string;
	/** All area notes from the configured area field (multi-area projects). */
	areaFiles: TFile[];
	/** Raw frontmatter (wikilink, URL, or path) for banner image. */
	banner?: string;
	/** Raw frontmatter color token or CSS color. */
	color?: string;
	/** From project note frontmatter `description`. */
	description?: string;
	/** Next review date (ISO), from configured frontmatter field. */
	nextReview?: string;
	/** Project deadline from configured frontmatter field (Kanban date axis). */
	deadline?: string;
	/** Project end date from configured frontmatter field (timeline, sidebar). */
	endDate?: string;
	/** From configurable frontmatter key; higher = more important. */
	rank?: number;
}

/** TaskNotes-compatible relative reminder (frontmatter `reminders` array item). */
export interface TaskRelativeReminder {
	type: "relative";
	anchor: "due" | "scheduled";
	offset: number;
	unit: "minutes" | "hours" | "days";
	direction: "before" | "after";
	description?: string;
}

/** TaskNotes-compatible absolute reminder. */
export interface TaskAbsoluteReminder {
	type: "absolute";
	date: string;
	time?: string;
	description?: string;
}

export type TaskReminderSpec = TaskRelativeReminder | TaskAbsoluteReminder;

export type RecurrenceAnchorMode = "scheduled" | "done";

export interface IndexedTask {
	file: TFile;
	title: string;
	status: string;
	priority?: string;
	dueDate?: string;
	scheduledDate?: string;
	completedDate?: string;
	/** When the task was actually done (calendar prefers this over scheduled). */
	startTime?: string;
	endTime?: string;
	/** Planned length in minutes from frontmatter `duration` (calendar block height). */
	durationMinutes?: number;
	/** Primary date for gantt (YYYY-MM-DD): frontmatter `date`, else scheduled/due. */
	ganttDate?: string;
	/** Inclusive span from merged `timeEntries` when logged work exists. */
	ganttTimeEntrySpan?: {startIso: string; endIso: string};
	projectFile: TFile | null;
	areaFile: TFile | null;
	tags: string[];
	createdAtMs: number;
	source: "taskNote" | "inline";
	/** 0-based line for inline checkbox tasks. */
	line?: number;
	trackedMinutes: number;
	/** RFC 5545 RRULE string (TaskNotes `recurrence`). */
	recurrence?: string;
	recurrenceAnchor?: RecurrenceAnchorMode;
	completeInstances?: string[];
	skippedInstances?: string[];
	reminders?: TaskReminderSpec[];
	/** Parent task note path when `projects` links to another task note (subtask). */
	parentTaskPath?: string | null;
	subtaskCount?: number;
	/** Parsed `#tag` tokens from inline checkbox lines. */
	inlineTags?: string[];
	/** Task note referenced as a project by other tasks. */
	isProjectTask?: boolean;
	/** Materialized occurrence note parent path. */
	recurrenceParentPath?: string;
	occurrenceDate?: string;
}

/** Planner time-block line under the daily-note heading (Day Planner format). */
export interface IndexedPlannerEvent {
	file: TFile;
	/** 0-based line in the daily note */
	line: number;
	/** YYYY-MM-DD from the daily note file */
	dateIso: string;
	title: string;
	status: string;
	startMinutes: number | null;
	durationMinutes: number | null;
}

export interface IndexedMeeting {
	file: TFile;
	date?: string;
	/** Explicit end datetime from frontmatter when configured (meeting end field). */
	endTime?: string;
	title?: string;
	duration?: number;
	totalMinutesTracked?: number;
	projectFile: TFile | null;
}

export interface AtomicNoteRow {
	file: TFile;
	status?: string;
	dateSort: string;
	dateDisplay: string;
	trackedMinutes: number;
	/** Primary label for the row (entry / heading / basename). */
	entryTitle: string;
	noteType?: string;
	bodyPreview?: string;
	tags: string[];
	priority?: string;
	/** Explicit frontmatter date/startTime/startDate for activity ordering; unchanged when the file is touched. */
	anchorDateMs?: number;
	/** Vault file mtime — activity sort fallback when no anchor date. */
	modifiedMs: number;
	/** When set, time tracking is closed for this note — exclude from Next up. */
	endTime?: string;
}

export interface IndexedPerson {
	/** Null when the wikilink has no note under the configured people folder. */
	file: TFile | null;
	/** Wikilink path used in frontmatter (for ghost create + dedupe). */
	linkText: string;
	name: string;
	avatarSrc: string | null;
	/** Resolved `banner` (or configured project banner field) for the people note; card top only. */
	bannerImageSrc: string | null;
	/** Wikilink present but no matching people-folder note (or resolved outside people folder). */
	isGhost: boolean;
}

/** Generic linked note from project frontmatter (e.g. related products). */
export interface IndexedRelatedNote {
	file: TFile;
	name: string;
}

export interface ProjectPageMeta {
	endDate?: string;
	lastReviewed?: string;
	nextReview?: string;
	reviewFrequencyDays: number;
	jira?: string;
	description?: string;
	agentSummary?: string;
}

export interface ProjectRollup {
	project: IndexedProject;
	tasks: IndexedTask[];
	meetings: IndexedMeeting[];
	/** TaskNotes (and similar) linked to this project. */
	atomicNotes: AtomicNoteRow[];
	totalTasks: number;
	doneTasks: number;
	openTasks: number;
	overdueTasks: number;
	completionRatio: number;
	nextTasks: IndexedTask[];
	/** Task + atomic + project self + meetings (positive tracked FM if set, else duration minutes). */
	aggregatedTrackedMinutes: number;
	pageMeta: ProjectPageMeta;

	bannerImageSrc: string | null;
	/** Resolved CSS color for accents, charts, and solid banner fallback. */
	accentColorCss: string;
	hasBannerImage: boolean;
	hasProjectColor: boolean;
	/** Related people: from project frontmatter + related notes/tasks (when people folder set). */
	relatedPeople: IndexedPerson[];
	/** Related projects from project frontmatter wikilinks (indexed projects only). */
	relatedProjects: IndexedProject[];
	/** Related products (or other linked notes) from project frontmatter wikilinks. */
	relatedProducts: IndexedRelatedNote[];
}

export interface IndexSnapshot {
	areas: IndexedArea[];
	projects: IndexedProject[];
	tasks: IndexedTask[];
	meetings: IndexedMeeting[];
	plannerEvents: IndexedPlannerEvent[];
	rebuiltAt: number;
}
