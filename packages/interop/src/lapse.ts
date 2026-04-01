/**
 * Lapse (`lapse-tracker`) interop — align with legacy obsidian-lapse-tracker
 * manifest id, window events, and `.api` surface.
 */

export const LAPSE_PLUGIN_ID = "lapse-tracker" as const;

export const LAPSE_PUBLIC_API_READY_EVENT = `${LAPSE_PLUGIN_ID}:public-api-ready` as const;

export const LAPSE_PUBLIC_API_UNLOAD_EVENT = `${LAPSE_PLUGIN_ID}:public-api-unload` as const;

export interface LapseQuickStartItemPublic {
	kind: "template" | "project";
	templatePath: string | null;
	templateName: string;
	project: string | null;
	projectColor: string | null;
	groupValue: string | null;
	projectSourcePath: string | null;
	area: string | null;
	timerDescription: string | null;
}

export interface LapsePublicApi {
	readonly pluginId: typeof LAPSE_PLUGIN_ID;
	getQuickStartItems(): Promise<LapseQuickStartItemPublic[]>;
	executeQuickStart(item: LapseQuickStartItemPublic): Promise<void>;
	invalidateQuickStartCache(): void;
	/**
	 * Start a running timer in an existing note: appends a lapse fenced code block if missing, updates
	 * in-memory time data and frontmatter (startTime, time entries, totalTimeTracked, etc.).
	 * Optional when older Lapse builds are installed; callers should check before invoking.
	 */
	startTimerInNote?(
		notePath: string,
		options?: { projectName?: string | null; noteTitle?: string | null },
	): Promise<void>;
}
