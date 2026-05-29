import type {TFile} from "obsidian";

export interface TimeEntry {
	id: string;
	label: string;
	startTime: number | null;
	endTime: number | null;
	/** Duration in milliseconds. */
	duration: number;
	isPaused: boolean;
	tags: string[];
}

/** Tentative calendar block; stored in planner day notes — not counted as logged work. */
export interface PlannedBlock {
	id: string;
	label: string;
	startTime: number;
	endTime: number;
	project: string | null;
	tags: string[];
}

export interface TimerQuery {
	project?: string;
	tag?: string;
	note?: string;
	from?: string;
	to?: string;
	period?: "today" | "thisWeek" | "thisMonth" | "lastWeek" | "lastMonth";
	groupBy?: "project" | "date" | "tag" | "note";
	display?: "table" | "summary" | "chart";
	chart?: "bar" | "pie" | "none";
}

export interface PageTimeData {
	entries: TimeEntry[];
	totalTimeTracked: number;
}

export interface CachedFileData {
	lastModified: number;
	entries: TimeEntry[];
	project: string | null;
	totalTime: number;
}

export interface EntryCache {
	[filePath: string]: CachedFileData;
}

export interface TemplateData {
	kind: "template" | "project";
	template: TFile | null;
	templateName: string;
	project: string | null;
	/** Resolved CSS color (via resolveProjectAccentCss), not raw frontmatter token. */
	projectColor: string | null;
	groupValue: string | null;
	projectSourcePath?: string | null;
	area: string | null;
	timerDescription: string | null;
}

export interface TemplateGroupResult {
	grouped: Map<string, TemplateData[]>;
	sortedProjects: string[];
	groupLabels: Map<string, string>;
}

export interface QuickStartDurationMaps {
	byProject: Map<string, number>;
	byNoteBase: Map<string, number>;
}

export interface NoteEntryGroup {
	file: TFile;
	entries: TimeEntry[];
}

export interface QuickStartItemPublic {
	kind: "template" | "project";
	templatePath: string | null;
	templateName: string;
	project: string | null;
	/** Resolved CSS color (via resolveProjectAccentCss), not raw frontmatter token. */
	projectColor: string | null;
	groupValue: string | null;
	projectSourcePath: string | null;
	area: string | null;
	timerDescription: string | null;
}

export interface PlannedBlockPublic {
	readonly id: string;
	readonly label: string;
	readonly startTime: number;
	readonly endTime: number;
	readonly dateIso: string;
	readonly project: string | null;
	readonly tags: readonly string[];
	readonly plannerNotePath: string;
}

export interface PlannedBlockUpsertInput {
	id?: string;
	label: string;
	startTime: number;
	endTime: number;
	dateIso: string;
	project?: string | null;
	tags?: string[];
}

export type TimeModeTab = "overview" | "activity" | "sessions" | "entryGrid";

export const FULCRUM_PLANNED_DRAG_MIME = "application/x-obsidian-fulcrum-planned+json" as const;
