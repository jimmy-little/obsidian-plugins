export const WIDGET_BRIDGE_VERSION = 1;
export const DEFAULT_WIDGET_BRIDGE_PATH = "Fulcrum/.widget-bridge.json";

export type WidgetBridgeOp = "start" | "stop" | "stop_all";

export interface WidgetBridgePendingCommand {
	id: string;
	op: WidgetBridgeOp;
	/** Quick start button id from `quickStartItems[].id`. */
	quickStartId?: string;
	/** Vault-relative path to a markdown note. */
	notePath?: string;
	/** Disambiguate stop when multiple devices queued commands. */
	startMs?: number;
	createdAt: string;
	processedAt?: string;
	processedBy?: string;
}

export interface WidgetBridgeActiveTimer {
	notePath: string;
	label: string;
	startMs: number;
	project: string | null;
	entryId: string | null;
	/** Set by companion for toggle/stop before Obsidian publishes. */
	quickStartId?: string | null;
}

export interface WidgetBridgeQuickStartItem {
	id: string;
	label: string;
	kind: "template" | "project";
	templatePath: string | null;
	templateName: string;
	project: string | null;
	projectSourcePath: string | null;
	area: string | null;
	timerDescription: string | null;
}

export interface WidgetBridgeTimerSettingsSnapshot {
	entriesKey: string;
	legacyEntriesKeys: string[];
	startTimeKey: string;
	endTimeKey: string;
	totalTimeKey: string;
	projectKey: string;
	dateFormat: string;
	showSeconds: boolean;
	timerButtonTemplatesFolder: string;
	excludedFolders: string[];
}

export interface WidgetBridgeFile {
	version: number;
	deviceId: string;
	updatedAt: string;
	lastReconciledAt: string | null;
	activeTimers: WidgetBridgeActiveTimer[];
	quickStartItems: WidgetBridgeQuickStartItem[];
	timerSettings: WidgetBridgeTimerSettingsSnapshot;
	pendingCommands: WidgetBridgePendingCommand[];
}

export function emptyBridgeFile(deviceId: string): WidgetBridgeFile {
	const now = new Date().toISOString();
	return {
		version: WIDGET_BRIDGE_VERSION,
		deviceId,
		updatedAt: now,
		lastReconciledAt: null,
		activeTimers: [],
		quickStartItems: [],
		timerSettings: {
			entriesKey: "fulcrumTimerEntries",
			legacyEntriesKeys: ["timeEntries", "lapseEntries"],
			startTimeKey: "startTime",
			endTimeKey: "endTime",
			totalTimeKey: "totalTimeTracked",
			projectKey: "project",
			dateFormat: "YYYY-MM-DD HH:mm:ss",
			showSeconds: true,
			timerButtonTemplatesFolder: "Templates/Fulcrum Timer Buttons",
			excludedFolders: [],
		},
		pendingCommands: [],
	};
}
