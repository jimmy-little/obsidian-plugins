/**
 * Lapse (`lapse-tracker`) interop — align with legacy obsidian-lapse-tracker
 * manifest id, window events, and `.api` surface.
 */

export const LAPSE_PLUGIN_ID = "lapse-tracker" as const;

export const LAPSE_PUBLIC_API_READY_EVENT = `${LAPSE_PLUGIN_ID}:public-api-ready` as const;

export const LAPSE_PUBLIC_API_UNLOAD_EVENT = `${LAPSE_PLUGIN_ID}:public-api-unload` as const;

/** Drag/drop and JSON payloads for planned time blocks (calendar ↔ other plugins). */
export const LAPSE_PLANNED_DRAG_MIME = "application/x-obsidian-lapse-planned+json" as const;

export interface LapsePlannedBlockPublic {
	readonly id: string;
	readonly label: string;
	readonly startTime: number;
	readonly endTime: number;
	/** Local calendar day YYYY-MM-DD (planner note day). */
	readonly dateIso: string;
	readonly project: string | null;
	readonly tags: readonly string[];
	readonly plannerNotePath: string;
}

export interface LapsePlannedBlockUpsertInput {
	id?: string;
	label: string;
	startTime: number;
	endTime: number;
	/** Calendar day for the planner note (YYYY-MM-DD). */
	dateIso: string;
	project?: string | null;
	tags?: string[];
}

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
	/** List planned time blocks (not logged work) intersecting [startMs, endMs]. */
	listPlannedBlocksInRange?(startMs: number, endMs: number): Promise<LapsePlannedBlockPublic[]>;
	/** Create or replace a planned block by id; omit id to create. */
	upsertPlannedBlock?(input: LapsePlannedBlockUpsertInput): Promise<LapsePlannedBlockPublic>;
	/** Remove a planned block from its day note. */
	deletePlannedBlock?(id: string, dateIso: string): Promise<void>;
}
