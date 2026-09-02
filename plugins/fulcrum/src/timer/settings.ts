export type QuickStartGroupBy = "area" | "project" | "status";

export interface TimerSettings {
	dateFormat: string;
	showSeconds: boolean;
	startTimeKey: string;
	endTimeKey: string;
	/** Primary write key for new timer sessions. */
	entriesKey: string;
	/** Legacy keys always read during transition. */
	legacyEntriesKeys: string[];
	totalTimeKey: string;
	projectKey: string;
	quickStartGroupBy: QuickStartGroupBy;
	quickStartAreaKey: string;
	quickStartEntryKey: string;
	defaultLabelType: "freeText" | "frontmatter" | "fileName";
	defaultLabelText: string;
	defaultLabelFrontmatterKey: string;
	removeTimestampFromFileName: boolean;
	hideTimestampsInViews: boolean;
	defaultTagOnNote: string;
	defaultTagOnTimeEntries: string;
	timeAdjustMinutes: number;
	firstDayOfWeek: number;
	excludedFolders: string[];
	showStatusBar: boolean;
	timerButtonTemplatesFolder: string;
	defaultProjectFolder: string;
	defaultTimerSavePath: string;
	defaultTimerTemplate: string;
	showDurationOnNoteButtons: boolean;
	noteButtonDurationType: "project" | "note";
	noteButtonTimePeriod: "today" | "thisWeek" | "thisMonth" | "lastWeek" | "lastMonth";
	plannedBlocksFolder: string;
	plannedBlocksKey: string;
	/** Legacy planned-block keys read during transition. */
	legacyPlannedBlocksKeys: string[];
	calendarDrawMode: "ask" | "plan" | "log";
	/** Calendar overlay layer toggles. */
	calendarShowTasks: boolean;
	calendarShowMeetings: boolean;
	calendarShowLogged: boolean;
	calendarShowPlanned: boolean;
	/** Imported Bridge / system calendar events on the Fulcrum calendar. */
	calendarShowEvents: boolean;
	/** One-time import from lapse-tracker completed. */
	lapseDataMigrated: boolean;
}

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
	dateFormat: "YYYY-MM-DD HH:mm:ss",
	showSeconds: true,
	startTimeKey: "startTime",
	endTimeKey: "endTime",
	entriesKey: "timeEntries",
	legacyEntriesKeys: ["fulcrumTimerEntries", "lapseEntries"],
	totalTimeKey: "totalTimeTracked",
	projectKey: "project",
	quickStartGroupBy: "project",
	quickStartAreaKey: "area",
	quickStartEntryKey: "entry",
	defaultLabelType: "freeText",
	defaultLabelText: "",
	defaultLabelFrontmatterKey: "project",
	removeTimestampFromFileName: false,
	hideTimestampsInViews: true,
	defaultTagOnNote: "#fulcrum-timer",
	defaultTagOnTimeEntries: "",
	timeAdjustMinutes: 5,
	firstDayOfWeek: 0,
	excludedFolders: [],
	showStatusBar: true,
	timerButtonTemplatesFolder: "Templates/Fulcrum Timer Buttons",
	defaultProjectFolder: "",
	defaultTimerSavePath: "",
	defaultTimerTemplate: "",
	showDurationOnNoteButtons: false,
	noteButtonDurationType: "note",
	noteButtonTimePeriod: "today",
	plannedBlocksFolder: "Fulcrum/Planner",
	plannedBlocksKey: "fulcrum_planned",
	legacyPlannedBlocksKeys: ["lapse_planned"],
	calendarDrawMode: "ask",
	calendarShowTasks: true,
	calendarShowMeetings: true,
	calendarShowLogged: true,
	calendarShowPlanned: true,
	calendarShowEvents: true,
	lapseDataMigrated: false,
};

export function normalizeQuickStartGroupBy(value: unknown): QuickStartGroupBy {
	if (value === "area" || value === "project" || value === "status") return value;
	const legacy = typeof value === "string" ? value.trim().toLowerCase() : "";
	if (legacy === "area" || legacy.includes("area")) return "area";
	if (legacy === "status") return "status";
	return "project";
}

/** All frontmatter keys to read entry arrays from. Primary key first for dedupe preference. */
export function allEntriesReadKeys(timer: TimerSettings): string[] {
	const keys: string[] = [];
	const primary = timer.entriesKey.trim();
	if (primary) keys.push(primary);
	for (const k of timer.legacyEntriesKeys) {
		const t = k.trim();
		if (t && t !== primary && !keys.includes(t)) keys.push(t);
	}
	return keys;
}

/** All frontmatter keys to read planned blocks from. */
export function allPlannedReadKeys(timer: TimerSettings): string[] {
	const keys = new Set<string>();
	for (const k of timer.legacyPlannedBlocksKeys) {
		const t = k.trim();
		if (t) keys.add(t);
	}
	const primary = timer.plannedBlocksKey.trim();
	if (primary) keys.add(primary);
	return [...keys];
}
