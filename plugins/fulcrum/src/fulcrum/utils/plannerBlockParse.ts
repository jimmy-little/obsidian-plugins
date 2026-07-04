import type {App, TFile} from "obsidian";
import type {IndexedPlannerEvent, IndexedProject} from "../types";
import {parseTimeRangeFromLine, stripTimeRangeFromTitle} from "./dayPlannerTime";
import {
	firstLinkedProjectFileInLine,
	stripInlineProjectLinks,
} from "./projectLink";

/** Default label for new planner lines and empty parsed titles. */
export const DEFAULT_PLANNER_BLOCK_TITLE = "Time block";

function plannerTrackedMinutesForBlock(
	status: string,
	durationMinutes: number | null,
): number {
	if (status !== "done") return 0;
	if (durationMinutes == null || durationMinutes <= 0) return 0;
	return durationMinutes;
}

/** Parse planner checkbox body: time range, display title, and optional `+[[project]]`. */
export function parsePlannerCheckboxBody(opts: {
	titleBare: string;
	fullText: string;
	defaultDurationMinutes: number;
	isChecked: boolean;
	app: App;
	sourcePath: string;
	projectPaths: Set<string>;
	indexedProjects: IndexedProject[];
}): {
	title: string;
	status: string;
	startMinutes: number | null;
	durationMinutes: number | null;
	projectFile: TFile | null;
	trackedMinutes: number;
} {
	const {
		titleBare,
		fullText,
		defaultDurationMinutes,
		isChecked,
		app,
		sourcePath,
		projectPaths,
		indexedProjects,
	} = opts;
	const time = parseTimeRangeFromLine(fullText);
	const projectFile = firstLinkedProjectFileInLine(
		app,
		titleBare,
		sourcePath,
		projectPaths,
		indexedProjects,
	);
	let title = time ? stripTimeRangeFromTitle(titleBare) : titleBare;
	title = stripInlineProjectLinks(title);
	if (!title.trim()) title = DEFAULT_PLANNER_BLOCK_TITLE;

	const status = isChecked ? "done" : "todo";
	const durationMinutes = time
		? time.durationMinutes ?? defaultDurationMinutes
		: null;
	const trackedMinutes = plannerTrackedMinutesForBlock(status, durationMinutes);

	return {
		title,
		status,
		startMinutes: time?.startMinutes ?? null,
		durationMinutes,
		projectFile,
		trackedMinutes,
	};
}

/** Sum done interstitial block minutes for a project, optionally within a date window. */
export function plannerTrackedMinutesForProject(
	events: IndexedPlannerEvent[],
	projectPath: string,
	opts?: {sinceMs?: number},
): number {
	let total = 0;
	for (const e of events) {
		if (e.projectFile?.path !== projectPath) continue;
		if (e.trackedMinutes <= 0) continue;
		if (opts?.sinceMs != null && opts.sinceMs > 0) {
			const dayMs = Date.parse(`${e.dateIso}T12:00:00`);
			if (!Number.isFinite(dayMs) || dayMs < opts.sinceMs) continue;
		}
		total += e.trackedMinutes;
	}
	return total;
}
