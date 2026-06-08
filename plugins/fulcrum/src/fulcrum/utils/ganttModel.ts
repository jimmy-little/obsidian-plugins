import type {App} from "obsidian";
import type {FulcrumSettings} from "../settingsDefaults";
import type {IndexSnapshot, IndexedProject, IndexedTask} from "../types";
import {
	buildAreaLifeModeMap,
	filterProjectsByAreaFocus,
	taskPassesAreaFilter,
	type AreaFilterState,
} from "./areaFocusFilter";
import {formatDayShort, getWeekStart, toISODate} from "./calendarGrid";
import {projectColorMap} from "./calendarEvents";
import {addDaysIso, todayLocalISODate} from "./dates";
import {resolveProjectAccentCss} from "./projectVisual";
import {isDoneStatus} from "../settingsDefaults";
import {parseIsoDateOnly} from "./taskTimeline";
import type {ProjectMilestone} from "./projectMilestones";

export type GanttVariant = "full" | "compact";

export type GanttZoom = "2w" | "4w" | "8w" | "quarter";

export type GanttRowKind = "project" | "task" | "milestone";

export type GanttRow = {
	id: string;
	kind: GanttRowKind;
	label: string;
	/** Inclusive YYYY-MM-DD span; null = label-only row (no bar). */
	bar: {startIso: string; endIso: string} | null;
	accentCss: string;
	open: () => void;
	done: boolean;
	indent: number;
	projectPath: string;
};

export type GanttDayColumn = {
	iso: string;
	label: string;
	dayNum: string;
	isToday: boolean;
	isWeekStart: boolean;
};

export type GanttModel = {
	rows: GanttRow[];
	rangeStartIso: string;
	rangeEndIso: string;
	dayCount: number;
	columns: GanttDayColumn[];
};


function minIso(a: string, b: string): string {
	return a <= b ? a : b;
}

function maxIso(a: string, b: string): string {
	return a >= b ? a : b;
}

/** Project bar from startDate → endDate. */
export function projectGanttSpan(p: IndexedProject): {startIso: string; endIso: string} | null {
	const start = parseIsoDateOnly(p.startDate);
	const end = parseIsoDateOnly(p.endDate);
	if (start && end) {
		return {startIso: minIso(start, end), endIso: maxIso(start, end)};
	}
	if (start) return {startIso: start, endIso: start};
	if (end) return {startIso: end, endIso: end};
	return null;
}

/** Task bar from timeEntries span, else a single ganttDate. */
export function taskGanttSpan(t: IndexedTask): {startIso: string; endIso: string} | null {
	if (t.ganttTimeEntrySpan) return t.ganttTimeEntrySpan;
	const d = parseIsoDateOnly(t.ganttDate);
	if (d) return {startIso: d, endIso: d};
	return null;
}

export function ganttZoomDayCount(zoom: GanttZoom): number {
	switch (zoom) {
		case "2w":
			return 14;
		case "4w":
			return 28;
		case "8w":
			return 56;
		case "quarter":
			return 91;
		default:
			return 28;
	}
}

function defaultRangeStart(zoom: GanttZoom, weekStartDay: number, focal: Date): string {
	const today = new Date(focal);
	today.setHours(12, 0, 0, 0);
	const ws = getWeekStart(today, weekStartDay);
	return toISODate(ws);
}

function collectSpanBounds(rows: GanttRow[]): {min: string; max: string} | null {
	let min: string | null = null;
	let max: string | null = null;
	for (const row of rows) {
		if (!row.bar) continue;
		min = min == null ? row.bar.startIso : minIso(min, row.bar.startIso);
		max = max == null ? row.bar.endIso : maxIso(max, row.bar.endIso);
	}
	if (!min || !max) return null;
	return {min, max};
}

function buildColumns(
	rangeStartIso: string,
	dayCount: number,
	weekStartDay: number,
): GanttDayColumn[] {
	const today = todayLocalISODate();
	const out: GanttDayColumn[] = [];
	for (let i = 0; i < dayCount; i++) {
		const iso = addDaysIso(rangeStartIso, i);
		const d = new Date(`${iso}T12:00:00`);
		out.push({
			iso,
			label: formatDayShort(d),
			dayNum: String(d.getDate()),
			isToday: iso === today,
			isWeekStart: d.getDay() === weekStartDay,
		});
	}
	return out;
}

export type BuildGanttModelOpts = {
	app: App;
	snapshot: IndexSnapshot;
	settings: FulcrumSettings;
	areaFilter: AreaFilterState;
	doneTask: Set<string>;
	doneProject: Set<string>;
	filterProjectPath?: string;
	showDoneTasks?: boolean;
	variant: GanttVariant;
	zoom?: GanttZoom;
	focalDate?: Date;
	rangeStartIso?: string;
	milestonesByProject?: Map<string, ProjectMilestone[]>;
	/** When false, task rows are omitted (dashboard timeline). */
	includeTasks?: boolean;
	/** When true, only projects with start/end dates and dated milestones are shown. */
	onlyDatedItems?: boolean;
	openProject: (path: string) => void;
	openTask: (task: IndexedTask) => void;
};

export function buildGanttModel(opts: BuildGanttModelOpts): GanttModel {
	const {
		app,
		snapshot,
		settings,
		areaFilter,
		doneTask,
		doneProject,
		filterProjectPath,
		showDoneTasks = false,
		variant,
		zoom = "4w",
		focalDate = new Date(),
		rangeStartIso: rangeStartOverride,
		milestonesByProject = new Map(),
		includeTasks = true,
		onlyDatedItems = false,
		openProject,
		openTask,
	} = opts;

	const lifeModeMap = buildAreaLifeModeMap(snapshot.areas, {
		projects: snapshot.projects,
		app,
		typeField: settings.typeField,
		areaTypeValue: settings.areaTypeValue,
		settings,
	});

	const colors = projectColorMap(snapshot.projects);
	let projects = snapshot.projects.filter((p) => !doneProject.has((p.status ?? "").trim().toLowerCase()));

	if (filterProjectPath) {
		projects = projects.filter((p) => p.file.path === filterProjectPath);
	} else {
		projects = filterProjectsByAreaFocus(projects, areaFilter, lifeModeMap);
	}

	projects = [...projects].sort((a, b) => {
		const ra = a.rank ?? Number.MAX_SAFE_INTEGER;
		const rb = b.rank ?? Number.MAX_SAFE_INTEGER;
		if (ra !== rb) return ra - rb;
		return a.name.localeCompare(b.name, undefined, {sensitivity: "base"});
	});

	const rows: GanttRow[] = [];

	for (const p of projects) {
		const accentCss = resolveProjectAccentCss(colors.get(p.file.path) ?? p.color);
		const projectBar = projectGanttSpan(p);
		const projectTasks = includeTasks
			? snapshot.tasks
					.filter((t) => t.projectFile?.path === p.file.path)
					.filter((t) => showDoneTasks || !isDoneStatus(t.status, doneTask))
					.filter((t) => taskPassesAreaFilter(t, snapshot, areaFilter, lifeModeMap))
					.filter((t) => taskGanttSpan(t) != null)
					.sort((a, b) => a.title.localeCompare(b.title, undefined, {sensitivity: "base"}))
			: [];
		const projectMilestones = (milestonesByProject.get(p.file.path) ?? []).filter(
			(ms: ProjectMilestone) => (onlyDatedItems ? !!ms.dateIso?.trim() : true),
		);

		const includeProject = onlyDatedItems
			? projectBar != null || projectMilestones.length > 0
			: projectBar != null ||
				projectTasks.length > 0 ||
				projectMilestones.length > 0 ||
				(variant === "full" && filterProjectPath);

		if (!includeProject) continue;

		const showProjectRow = !onlyDatedItems || projectBar != null;

		if (showProjectRow) {
			rows.push({
				id: `project:${p.file.path}`,
				kind: "project",
				label: p.name,
				bar: projectBar,
				accentCss,
				open: () => openProject(p.file.path),
				done: false,
				indent: 0,
				projectPath: p.file.path,
			});
		}

		for (let mi = 0; mi < projectMilestones.length; mi++) {
			const ms = projectMilestones[mi]!;
			rows.push({
				id: `milestone:${p.file.path}:${ms.dateIso}:${mi}`,
				kind: "milestone",
				label: ms.title,
				bar: {startIso: ms.dateIso, endIso: ms.dateIso},
				accentCss,
				open: () => openProject(p.file.path),
				done: false,
				indent: showProjectRow ? 1 : 0,
				projectPath: p.file.path,
			});
		}

		if (includeTasks) {
			for (const t of projectTasks) {
				rows.push({
					id: `task:${t.file.path}`,
					kind: "task",
					label: t.title,
					bar: taskGanttSpan(t),
					accentCss,
					open: () => openTask(t),
					done: isDoneStatus(t.status, doneTask),
					indent: 1,
					projectPath: p.file.path,
				});
			}
		}
	}

	const weekStartDay = settings.calendarFirstDayOfWeek;
	let rangeStartIso: string;
	let dayCount: number;

	if (variant === "compact") {
		const bounds = collectSpanBounds(rows);
		const today = todayLocalISODate();
		if (bounds) {
			rangeStartIso = addDaysIso(bounds.min, -3);
			const end = addDaysIso(bounds.max, 3);
			dayCount =
				Math.round(
					(Date.parse(`${end}T12:00:00`) - Date.parse(`${rangeStartIso}T12:00:00`)) /
						86400000,
				) + 1;
			dayCount = Math.max(14, Math.min(dayCount, 84));
		} else {
			rangeStartIso = defaultRangeStart("4w", weekStartDay, focalDate);
			dayCount = 28;
		}
		// Keep “today” visible when possible
		if (today >= rangeStartIso && today <= addDaysIso(rangeStartIso, dayCount - 1)) {
			/* ok */
		} else {
			rangeStartIso = addDaysIso(today, -7);
		}
	} else {
		dayCount = ganttZoomDayCount(zoom);
		rangeStartIso = rangeStartOverride ?? defaultRangeStart(zoom, weekStartDay, focalDate);
	}

	const rangeEndIso = addDaysIso(rangeStartIso, dayCount - 1);
	const columns = buildColumns(rangeStartIso, dayCount, weekStartDay);

	return {rows, rangeStartIso, rangeEndIso, dayCount, columns};
}

/** Bar geometry as percentage of the visible range (clamped). */
export function ganttBarStyle(
	bar: {startIso: string; endIso: string},
	rangeStartIso: string,
	dayCount: number,
): {left: string; width: string} {
	const rangeStartMs = Date.parse(`${rangeStartIso}T12:00:00`);
	const startMs = Date.parse(`${bar.startIso}T12:00:00`);
	const endMs = Date.parse(`${bar.endIso}T12:00:00`);
	const startIdx = Math.max(0, Math.round((startMs - rangeStartMs) / 86400000));
	const endIdx = Math.min(dayCount - 1, Math.round((endMs - rangeStartMs) / 86400000));
	const span = Math.max(1, endIdx - startIdx + 1);
	const leftPct = (startIdx / dayCount) * 100;
	const widthPct = (span / dayCount) * 100;
	return {left: `${leftPct}%`, width: `${widthPct}%`};
}

/** Center of a single-day marker (milestones). */
export function ganttMilestoneMarkerLeft(
	dateIso: string,
	rangeStartIso: string,
	dayCount: number,
): string {
	const style = ganttBarStyle({startIso: dateIso, endIso: dateIso}, rangeStartIso, dayCount);
	const leftPct = Number.parseFloat(style.left) + Number.parseFloat(style.width) / 2;
	return `${leftPct}%`;
}

/** Vertical “today” marker position within the grid. */
export function ganttTodayMarkerLeft(rangeStartIso: string, dayCount: number): string | null {
	const today = todayLocalISODate();
	const rangeEnd = addDaysIso(rangeStartIso, dayCount - 1);
	if (today < rangeStartIso || today > rangeEnd) return null;
	const idx = Math.round(
		(Date.parse(`${today}T12:00:00`) - Date.parse(`${rangeStartIso}T12:00:00`)) / 86400000,
	);
	return `${((idx + 0.5) / dayCount) * 100}%`;
}

export function ganttRangeTitle(rangeStartIso: string, rangeEndIso: string): string {
	const s = new Date(`${rangeStartIso}T12:00:00`);
	const e = new Date(`${rangeEndIso}T12:00:00`);
	const fmt = new Intl.DateTimeFormat(undefined, {month: "short", day: "numeric"});
	const fmtY = new Intl.DateTimeFormat(undefined, {month: "short", day: "numeric", year: "numeric"});
	if (s.getFullYear() === e.getFullYear()) {
		return `${fmt.format(s)} – ${fmtY.format(e)}`;
	}
	return `${fmtY.format(s)} – ${fmtY.format(e)}`;
}

export function shiftGanttRangeStart(rangeStartIso: string, days: number): string {
	return addDaysIso(rangeStartIso, days);
}

export function ganttRangeStartForToday(zoom: GanttZoom, weekStartDay: number): string {
	return defaultRangeStart(zoom, weekStartDay, new Date());
}
