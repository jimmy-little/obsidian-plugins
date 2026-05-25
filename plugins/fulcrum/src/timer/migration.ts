import type {App} from "obsidian";
import type {TimerSettings} from "./settings";
import {DEFAULT_TIMER_SETTINGS, normalizeQuickStartGroupBy} from "./settings";
import type {EntryCache} from "./types";

/** Shape of legacy lapse-tracker data.json (partial). */
interface LegacyLapseData {
	dateFormat?: string;
	showSeconds?: boolean;
	startTimeKey?: string;
	endTimeKey?: string;
	entriesKey?: string;
	totalTimeKey?: string;
	projectKey?: string;
	quickStartGroupByKey?: string;
	quickStartAreaKey?: string;
	quickStartEntryKey?: string;
	defaultLabelType?: TimerSettings["defaultLabelType"];
	defaultLabelText?: string;
	defaultLabelFrontmatterKey?: string;
	removeTimestampFromFileName?: boolean;
	hideTimestampsInViews?: boolean;
	defaultTagOnNote?: string;
	defaultTagOnTimeEntries?: string;
	timeAdjustMinutes?: number;
	firstDayOfWeek?: number;
	excludedFolders?: string[];
	showStatusBar?: boolean;
	lapseButtonTemplatesFolder?: string;
	defaultProjectFolder?: string;
	defaultTimerSavePath?: string;
	defaultTimerTemplate?: string;
	showDurationOnNoteButtons?: boolean;
	noteButtonDurationType?: TimerSettings["noteButtonDurationType"];
	noteButtonTimePeriod?: TimerSettings["noteButtonTimePeriod"];
	plannedBlocksFolder?: string;
	plannedBlocksKey?: string;
	calendarDrawMode?: TimerSettings["calendarDrawMode"];
	entryCache?: EntryCache;
	lapseDataMigrated?: boolean;
}

async function readLegacyLapseData(app: App): Promise<LegacyLapseData | null> {
	const adapters = app.vault.adapter as {getBasePath?: () => string};
	const base = adapters.getBasePath?.() ?? "";
	if (!base) return null;
	try {
		const fs = await import("node:fs/promises");
		const path = await import("node:path");
		const legacyPath = path.join(base, ".obsidian", "plugins", "lapse-tracker", "data.json");
		const raw = await fs.readFile(legacyPath, "utf8");
		return JSON.parse(raw) as LegacyLapseData;
	} catch {
		return null;
	}
}

export async function migrateTimerSettings(
	app: App,
	timer: TimerSettings,
	entryCache: EntryCache,
): Promise<{timer: TimerSettings; entryCache: EntryCache}> {
	if (timer.lapseDataMigrated) return {timer, entryCache};

	const legacy = await readLegacyLapseData(app);
	if (!legacy) {
		return {
			timer: {...timer, lapseDataMigrated: true},
			entryCache,
		};
	}

	const legacyKeys = [...timer.legacyEntriesKeys];
	const oldEntriesKey = legacy.entriesKey?.trim();
	if (oldEntriesKey && !legacyKeys.includes(oldEntriesKey)) {
		legacyKeys.push(oldEntriesKey);
	}

	const legacyPlanned = [...timer.legacyPlannedBlocksKeys];
	const oldPlannedKey = legacy.plannedBlocksKey?.trim();
	if (oldPlannedKey && oldPlannedKey !== "fulcrum_planned" && !legacyPlanned.includes(oldPlannedKey)) {
		legacyPlanned.push(oldPlannedKey);
	}

	const migrated: TimerSettings = {
		...timer,
		dateFormat: legacy.dateFormat ?? timer.dateFormat,
		showSeconds: legacy.showSeconds ?? timer.showSeconds,
		startTimeKey: legacy.startTimeKey ?? timer.startTimeKey,
		endTimeKey: legacy.endTimeKey ?? timer.endTimeKey,
		legacyEntriesKeys: legacyKeys,
		totalTimeKey: legacy.totalTimeKey ?? timer.totalTimeKey,
		projectKey: legacy.projectKey ?? timer.projectKey,
		quickStartGroupBy: normalizeQuickStartGroupBy(
			legacy.quickStartGroupByKey ?? timer.quickStartGroupBy,
		),
		quickStartAreaKey: legacy.quickStartAreaKey ?? timer.quickStartAreaKey,
		quickStartEntryKey: legacy.quickStartEntryKey ?? timer.quickStartEntryKey,
		defaultLabelType: legacy.defaultLabelType ?? timer.defaultLabelType,
		defaultLabelText: legacy.defaultLabelText ?? timer.defaultLabelText,
		defaultLabelFrontmatterKey: legacy.defaultLabelFrontmatterKey ?? timer.defaultLabelFrontmatterKey,
		removeTimestampFromFileName:
			legacy.removeTimestampFromFileName ?? timer.removeTimestampFromFileName,
		hideTimestampsInViews: legacy.hideTimestampsInViews ?? timer.hideTimestampsInViews,
		defaultTagOnNote: legacy.defaultTagOnNote?.replace(/^#lapse\b/, "#fulcrum-timer") ?? timer.defaultTagOnNote,
		defaultTagOnTimeEntries: legacy.defaultTagOnTimeEntries ?? timer.defaultTagOnTimeEntries,
		timeAdjustMinutes: legacy.timeAdjustMinutes ?? timer.timeAdjustMinutes,
		firstDayOfWeek: legacy.firstDayOfWeek ?? timer.firstDayOfWeek,
		excludedFolders: legacy.excludedFolders ?? timer.excludedFolders,
		showStatusBar: legacy.showStatusBar ?? timer.showStatusBar,
		timerButtonTemplatesFolder:
			legacy.lapseButtonTemplatesFolder ?? timer.timerButtonTemplatesFolder,
		defaultProjectFolder: legacy.defaultProjectFolder ?? timer.defaultProjectFolder,
		defaultTimerSavePath: legacy.defaultTimerSavePath ?? timer.defaultTimerSavePath,
		defaultTimerTemplate: legacy.defaultTimerTemplate ?? timer.defaultTimerTemplate,
		showDurationOnNoteButtons:
			legacy.showDurationOnNoteButtons ?? timer.showDurationOnNoteButtons,
		noteButtonDurationType: legacy.noteButtonDurationType ?? timer.noteButtonDurationType,
		noteButtonTimePeriod: legacy.noteButtonTimePeriod ?? timer.noteButtonTimePeriod,
		plannedBlocksFolder: legacy.plannedBlocksFolder ?? timer.plannedBlocksFolder,
		legacyPlannedBlocksKeys: legacyPlanned,
		calendarDrawMode: legacy.calendarDrawMode ?? timer.calendarDrawMode,
		lapseDataMigrated: true,
	};

	const cache = legacy.entryCache && typeof legacy.entryCache === "object" ? legacy.entryCache : entryCache;

	return {timer: migrated, entryCache: cache};
}

export function mergeTimerDefaults(
	partial?: Partial<TimerSettings> & {quickStartGroupByKey?: string},
): TimerSettings {
	const legacyGroupKey = partial?.quickStartGroupByKey;
	const {quickStartGroupByKey: _drop, ...rest} = partial ?? {};
	const merged: TimerSettings = {...DEFAULT_TIMER_SETTINGS, ...rest};
	merged.quickStartGroupBy = normalizeQuickStartGroupBy(
		rest.quickStartGroupBy ?? legacyGroupKey,
	);
	return merged;
}
