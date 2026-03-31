import type {App} from "obsidian";
import type {FulcrumSettings, TimeTrackerHorizon} from "../settingsDefaults";
import type {ProjectRollup} from "../types";
import {readTrackedMinutesFromFm} from "./trackedMinutes";
import {meetingEffectiveMinutes} from "./meetingEffectiveMinutes";

export type TimeHorizonId = TimeTrackerHorizon;

/** Sentinel path for projects with no area note (area toggles). */
export const TIME_TRACKER_NO_AREA_PATH = "__fulcrum_no_area__";

export function horizonDays(id: TimeHorizonId): number {
	switch (id) {
		case "7d":
			return 7;
		case "30d":
			return 30;
		case "90d":
			return 90;
		default:
			return 0;
	}
}

function cutoffMs(horizon: TimeHorizonId): number {
	const d = horizonDays(horizon);
	if (d <= 0) return 0;
	return Date.now() - d * 86400000;
}

function inWindow(ts: number, cutoff: number): boolean {
	if (cutoff <= 0) return true;
	return ts >= cutoff;
}

function taskActivityMs(t: ProjectRollup["tasks"][0]): number {
	return Math.max(t.file.stat.mtime, t.createdAtMs ?? 0);
}

export type ProjectTimeBreakdown = {
	path: string;
	name: string;
	accentColorCss: string;
	totalMinutes: number;
	fromTasks: number;
	fromMeetings: number;
	fromAtomicNotes: number;
	fromProjectNote: number;
	tasksWithTrack: number;
	meetingsWithTime: number;
	atomicNotesWithTrack: number;
};

export type TimeTrackedInsight = {
	label: string;
	value: string;
	hint?: string;
};

export type TimeTrackedModel = {
	horizon: TimeHorizonId;
	cutoffMs: number;
	projects: ProjectTimeBreakdown[];
	totalMinutes: number;
	totalProjectsWithTime: number;
	topProject: ProjectTimeBreakdown | null;
	/** Task with highest tracked minutes in window */
	topSingleTask: {title: string; minutes: number; projectName: string; path: string} | null;
	/** Project with largest count of tasks that have tracked > 0 in window */
	mostTasksTrackedProject: {name: string; path: string; count: number} | null;
	/** Project where meeting time / total is highest (min 15m total) */
	meetingHeaviestProject: {name: string; path: string; pct: number} | null;
	/** Average minutes per task (among tasks with track > 0 in window) */
	avgMinutesPerTrackedTask: number | null;
	insights: TimeTrackedInsight[];
	/** Top slices for pie + bar (same order) */
	topSlices: {label: string; minutes: number; color: string}[];
};

const PIE_COLORS = [
	"var(--color-blue)",
	"var(--color-purple)",
	"var(--color-green)",
	"var(--color-orange)",
	"var(--color-red)",
	"var(--color-yellow)",
	"var(--color-cyan)",
	"var(--text-accent)",
];

function sliceColor(i: number): string {
	return PIE_COLORS[i % PIE_COLORS.length] ?? "var(--text-muted)";
}

/**
 * Build dashboard model from project rollups. Uses file mtimes / task createdAt / note modifiedMs
 * as a proxy for “activity in window” when a time horizon is selected (refine with real logs later).
 */
export function buildTimeTrackedModel(
	app: App,
	settings: FulcrumSettings,
	rollups: ProjectRollup[],
	horizon: TimeHorizonId,
	excludedAreaPaths?: Set<string>,
): TimeTrackedModel {
	const cutoff = cutoffMs(horizon);
	const field = settings.taskTrackedMinutesField;
	const excluded = excludedAreaPaths ?? new Set<string>();

	const projects: ProjectTimeBreakdown[] = [];

	let globalTopTask: {title: string; minutes: number; projectName: string; path: string} | null =
		null;
	let mostTasks: {name: string; path: string; count: number} | null = null;
	let meetingHeaviest: {name: string; path: string; pct: number} | null = null;

	let sumTaskMinutesForAvg = 0;
	let countTrackedTasks = 0;

	for (const r of rollups) {
		const p = r.project;
		const areaKey = p.areaFile?.path ?? TIME_TRACKER_NO_AREA_PATH;
		if (excluded.has(areaKey)) continue;

		const path = p.file.path;
		const name = p.name;

		let fromTasks = 0;
		let fromMeetings = 0;
		let fromAtomic = 0;
		let fromProjectNote = 0;
		let tasksWithTrack = 0;
		let meetingsWithTime = 0;
		let atomicNotesWithTrack = 0;

		const pFm = app.metadataCache.getFileCache(p.file)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		const selfMin = readTrackedMinutesFromFm(pFm, field);
		if (selfMin > 0 && inWindow(p.file.stat.mtime, cutoff)) {
			fromProjectNote = selfMin;
		}

		for (const t of r.tasks) {
			if (t.trackedMinutes <= 0) continue;
			if (!inWindow(taskActivityMs(t), cutoff)) continue;
			fromTasks += t.trackedMinutes;
			tasksWithTrack++;
			sumTaskMinutesForAvg += t.trackedMinutes;
			countTrackedTasks++;
			if (!globalTopTask || t.trackedMinutes > globalTopTask.minutes) {
				globalTopTask = {
					title: t.title,
					minutes: t.trackedMinutes,
					projectName: name,
					path: t.file.path,
				};
			}
		}

		for (const m of r.meetings) {
			const mm = meetingEffectiveMinutes(m);
			if (mm <= 0) continue;
			if (!inWindow(m.file.stat.mtime, cutoff)) continue;
			fromMeetings += mm;
			meetingsWithTime++;
		}

		for (const n of r.atomicNotes) {
			if (n.trackedMinutes <= 0) continue;
			if (!inWindow(n.modifiedMs, cutoff)) continue;
			fromAtomic += n.trackedMinutes;
			atomicNotesWithTrack++;
		}

		const totalMinutes =
			fromTasks + fromMeetings + fromAtomic + fromProjectNote;

		if (totalMinutes <= 0) continue;

		projects.push({
			path,
			name,
			accentColorCss: r.accentColorCss,
			totalMinutes,
			fromTasks,
			fromMeetings,
			fromAtomicNotes: fromAtomic,
			fromProjectNote,
			tasksWithTrack,
			meetingsWithTime,
			atomicNotesWithTrack,
		});

		if (!mostTasks || tasksWithTrack > mostTasks.count) {
			mostTasks = {name, path, count: tasksWithTrack};
		}
		if (totalMinutes >= 15) {
			const pct = Math.round((fromMeetings / totalMinutes) * 100);
			if (!meetingHeaviest || pct > meetingHeaviest.pct) {
				meetingHeaviest = {name, path, pct};
			}
		}
	}

	projects.sort((a, b) => b.totalMinutes - a.totalMinutes);

	const totalMinutes = projects.reduce((s, x) => s + x.totalMinutes, 0);
	const topProject = projects[0] ?? null;

	const topN = 6;
	const topSlices: {label: string; minutes: number; color: string}[] = [];
	let other = 0;
	for (let i = 0; i < projects.length; i++) {
		const pr = projects[i]!;
		if (i < topN) {
			topSlices.push({
				label: pr.name,
				minutes: pr.totalMinutes,
				color: sliceColor(i),
			});
		} else {
			other += pr.totalMinutes;
		}
	}
	if (other > 0) {
		topSlices.push({
			label: "Other",
			minutes: other,
			color: "var(--text-muted)",
		});
	}

	const insights: TimeTrackedInsight[] = [];
	if (globalTopTask) {
		insights.push({
			label: "Heaviest single task",
			value: `${globalTopTask.title.slice(0, 42)}${globalTopTask.title.length > 42 ? "…" : ""}`,
			hint: `${fmtHours(globalTopTask.minutes)} · ${globalTopTask.projectName}`,
		});
	}
	if (mostTasks && mostTasks.count > 0) {
		insights.push({
			label: "Most tasks with time logged",
			value: String(mostTasks.count),
			hint: mostTasks.name,
		});
	}
	if (meetingHeaviest && meetingHeaviest.pct >= 40) {
		insights.push({
			label: "Most meeting-heavy project",
			value: `${meetingHeaviest.pct}% from meetings`,
			hint: meetingHeaviest.name,
		});
	}
	const avgMin =
		countTrackedTasks > 0 ? Math.round(sumTaskMinutesForAvg / countTrackedTasks) : null;
	if (avgMin != null && avgMin > 0) {
		insights.push({
			label: "Avg minutes / tracked task",
			value: String(avgMin),
			hint: `${countTrackedTasks} tasks in view`,
		});
	}
	if (projects.length >= 2) {
		const [a, b] = projects;
		const gap = a!.totalMinutes - b!.totalMinutes;
		if (gap > 0 && a!.totalMinutes > 0) {
			insights.push({
				label: "Top vs #2 project",
				value: `${Math.round((gap / a!.totalMinutes) * 100)}% ahead`,
				hint: `${a!.name} vs ${b!.name}`,
			});
		}
	}

	return {
		horizon,
		cutoffMs: cutoff,
		projects,
		totalMinutes,
		totalProjectsWithTime: projects.length,
		topProject,
		topSingleTask: globalTopTask,
		mostTasksTrackedProject: mostTasks,
		meetingHeaviestProject: meetingHeaviest,
		avgMinutesPerTrackedTask: avgMin,
		insights,
		topSlices,
	};
}

export function fmtHours(mins: number): string {
	if (mins < 60) return `${mins}m`;
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** CSS conic-gradient stops for pie (0–100% cumulative). */
export function pieConicGradient(slices: {minutes: number; color: string}[]): string {
	const total = slices.reduce((s, x) => s + x.minutes, 0);
	if (total <= 0) return "conic-gradient(var(--background-modifier-border) 0deg 360deg)";
	let acc = 0;
	const parts: string[] = [];
	for (const sl of slices) {
		const pct = (sl.minutes / total) * 100;
		const start = acc;
		acc += pct;
		parts.push(`${sl.color} ${start}% ${acc}%`);
	}
	return `conic-gradient(${parts.join(", ")})`;
}
