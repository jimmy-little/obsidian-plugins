import type {FulcrumSettings, KanbanDimension, KanbanView} from "../settingsDefaults";
import {isDoneStatus, parseDoneStatusSet, parseList, parseTaskStatusChoices} from "../settingsDefaults";
import type {IndexedArea, IndexedProject, IndexedTask, IndexSnapshot} from "../types";
import {getProjectStatusOptions} from "../projectStatusApply";
import type {App} from "obsidian";
import {
	DATE_BUCKET_IDS,
	DATE_BUCKET_LABELS,
	dateBucketFor,
} from "./dateBuckets";
import {taskPrimaryDateIso} from "../tasks/tasksViewModel";
import {
	getKanbanColumnOrder,
	getKanbanHiddenColumns,
} from "./settingsKey";
import type {KanbanBoard, KanbanCard, KanbanColumnDef, KanbanLaneDef} from "./types";
import {kanbanCellKey, kanbanProjectCardId, kanbanTaskCardId} from "./types";

const UNASSIGNED_AREA = "__unassigned__";
const NO_PROJECT = "__no_project__";
const NO_STATUS = "__no_status__";

function titleCaseStatus(s: string): string {
	return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function orderColumns(
	defs: KanbanColumnDef[],
	order: string[],
	hidden: Set<string>,
): KanbanColumnDef[] {
	const visible = defs.filter((c) => !hidden.has(c.id));
	if (order.length === 0) return visible;
	const byId = new Map(visible.map((c) => [c.id, c]));
	const out: KanbanColumnDef[] = [];
	for (const id of order) {
		const c = byId.get(id);
		if (c) {
			out.push(c);
			byId.delete(id);
		}
	}
	for (const c of byId.values()) out.push(c);
	return out;
}

function buildAreaColumnDefs(
	areas: IndexedArea[],
	projects: IndexedProject[],
	tasks: IndexedTask[] = [],
): KanbanColumnDef[] {
	const byAreaPath = new Set<string>();
	for (const p of projects) {
		if (p.areaFiles.length === 0) {
			byAreaPath.add(UNASSIGNED_AREA);
		} else {
			for (const af of p.areaFiles) {
				byAreaPath.add(af.path);
			}
		}
	}
	for (const t of tasks) {
		byAreaPath.add(t.areaFile?.path ?? UNASSIGNED_AREA);
	}
	const out: KanbanColumnDef[] = [];
	for (const a of areas) {
		if (byAreaPath.has(a.file.path)) {
			out.push({id: a.file.path, label: a.name, area: a});
		}
	}
	for (const path of byAreaPath) {
		if (path === UNASSIGNED_AREA || areas.some((a) => a.file.path === path)) continue;
		const sampleProject = projects.find((p) =>
			p.areaFiles.some((af) => af.path === path),
		);
		const sampleTask = tasks.find((t) => t.areaFile?.path === path);
		const oa =
			sampleProject?.areaFiles.find((af) => af.path === path) ??
			sampleTask?.areaFile ??
			undefined;
		out.push({
			id: path,
			label:
				sampleProject?.areaName?.trim() ||
				oa?.basename.replace(/\.md$/i, "") ||
				"Other",
			area: oa ? areas.find((a) => a.file.path === oa.path) : undefined,
		});
	}
	// Always offer Unassigned so projects/tasks with no area stay visible for triage
	// (and can be dragged onto an area column to write frontmatter).
	out.push({id: UNASSIGNED_AREA, label: "Unassigned"});
	return out;
}

function buildStatusColumnDefs(
	statuses: string[],
	items: {status: string}[],
): KanbanColumnDef[] {
	const map = new Map<string, number>();
	for (const s of statuses) map.set(s.toLowerCase(), map.size);
	const keys = new Set<string>();
	for (const item of items) keys.add((item.status || "").trim().toLowerCase());
	for (const s of statuses) keys.add(s.toLowerCase());

	const sorted = [...keys].sort((a, b) => {
		const ia = map.get(a);
		const ib = map.get(b);
		const ua = ia === undefined;
		const ub = ib === undefined;
		if (ua && ub) return a.localeCompare(b);
		if (ua) return 1;
		if (ub) return -1;
		return ia - ib;
	});

	return sorted.map((k) => ({
		id: k || NO_STATUS,
		label: k ? titleCaseStatus(k) : "No status",
	}));
}

function buildProjectColumnDefs(projects: IndexedProject[]): KanbanColumnDef[] {
	const out: KanbanColumnDef[] = [{id: NO_PROJECT, label: "No project"}];
	for (const p of projects) {
		out.push({id: p.file.path, label: p.name, project: p});
	}
	return out;
}

function buildDateColumnDefs(): KanbanColumnDef[] {
	return DATE_BUCKET_IDS.map((id) => ({
		id,
		label: DATE_BUCKET_LABELS[id],
	}));
}

function columnDefsForDimension(
	dimension: KanbanDimension,
	view: KanbanView,
	snapshot: IndexSnapshot,
	settings: FulcrumSettings,
	app: App,
	activeProjects: IndexedProject[],
	openTasks: IndexedTask[],
): KanbanColumnDef[] {
	switch (dimension) {
		case "area":
			return buildAreaColumnDefs(
				snapshot.areas,
				view === "projects" ? activeProjects : [],
				view === "tasks" ? openTasks : [],
			);
		case "status":
			if (view === "projects") {
				return buildStatusColumnDefs(
					getProjectStatusOptions(app, settings),
					activeProjects,
				);
			}
			return buildStatusColumnDefs(parseTaskStatusChoices(settings), openTasks);
		case "project":
			return buildProjectColumnDefs(activeProjects);
		case "date":
			return buildDateColumnDefs();
		default:
			return [];
	}
}

function laneIdForDimension(
	dimension: KanbanDimension,
	view: KanbanView,
	card: KanbanCard,
	settings: FulcrumSettings,
): string {
	if (dimension === "area") {
		if (card.kind === "project") {
			const af = card.project.areaFiles[0];
			return af?.path ?? UNASSIGNED_AREA;
		}
		return card.task.areaFile?.path ?? UNASSIGNED_AREA;
	}
	if (dimension === "status") {
		const st = card.kind === "project" ? card.project.status : card.task.status;
		return (st || "").trim().toLowerCase() || NO_STATUS;
	}
	if (dimension === "project") {
		const pf =
			card.kind === "project" ? card.project.file : card.task.projectFile;
		return pf?.path ?? NO_PROJECT;
	}
	if (dimension === "date") {
		let iso: string | undefined;
		if (card.kind === "project") {
			iso =
				settings.kanbanProjectDateSource === "deadline"
					? card.project.deadline
					: card.project.nextReview;
		} else {
			iso = taskPrimaryDateIso(card.task) ?? card.task.dueDate;
		}
		return dateBucketFor(iso, settings.calendarFirstDayOfWeek);
	}
	return "__all__";
}

function columnIdForDimension(
	dimension: KanbanDimension,
	view: KanbanView,
	card: KanbanCard,
	settings: FulcrumSettings,
): string {
	return laneIdForDimension(dimension, view, card, settings);
}

export function buildKanbanBoard(
	app: App,
	settings: FulcrumSettings,
	snapshot: IndexSnapshot,
	activeProjects: IndexedProject[],
	openTasks: IndexedTask[],
): KanbanBoard {
	const view = settings.kanbanView;
	const colDim = settings.kanbanColumnBy;
	const laneDim = settings.kanbanSwimlaneBy;

	const hiddenCol = new Set(getKanbanHiddenColumns(settings, view, colDim));
	const orderCol = getKanbanColumnOrder(settings, view, colDim);

	let columnDefs = columnDefsForDimension(
		colDim,
		view,
		snapshot,
		settings,
		app,
		activeProjects,
		openTasks,
	);
	columnDefs = orderColumns(columnDefs, orderCol, hiddenCol);

	let laneDefs: KanbanLaneDef[];
	if (laneDim === "none") {
		laneDefs = [{id: "__all__", label: ""}];
	} else {
		const hiddenLane = new Set(getKanbanHiddenColumns(settings, view, laneDim));
		const orderLane = getKanbanColumnOrder(settings, view, laneDim);
		laneDefs = columnDefsForDimension(
			laneDim,
			view,
			snapshot,
			settings,
			app,
			activeProjects,
			openTasks,
		).map((c) => ({
			id: c.id,
			label: c.label,
			area: c.area,
			project: c.project,
		}));
		laneDefs = orderColumns(laneDefs as KanbanColumnDef[], orderLane, hiddenLane) as KanbanLaneDef[];
	}

	const cards: KanbanCard[] =
		view === "projects"
			? activeProjects.map((p) => ({
					kind: "project" as const,
					id: kanbanProjectCardId(p),
					project: p,
				}))
			: openTasks.map((t) => ({
					kind: "task" as const,
					id: kanbanTaskCardId(t),
					task: t,
					done: isDoneStatus(t.status, parseDoneStatusSet(settings.taskDoneStatuses)),
				}));

	const cells = new Map<string, KanbanCard[]>();
	for (const lane of laneDefs) {
		for (const col of columnDefs) {
			cells.set(kanbanCellKey(lane.id, col.id), []);
		}
	}

	for (const card of cards) {
		const laneId =
			laneDim === "none"
				? "__all__"
				: laneIdForDimension(laneDim, view, card, settings);
		const colId = columnIdForDimension(colDim, view, card, settings);
		const key = kanbanCellKey(laneId, colId);
		if (!cells.has(key)) cells.set(key, []);
		cells.get(key)!.push(card);
	}

	if (view === "projects") {
		for (const [, list] of cells) {
			list.sort((a, b) => {
				if (a.kind !== "project" || b.kind !== "project") return 0;
				return a.project.name.localeCompare(b.project.name);
			});
		}
	} else {
		for (const [, list] of cells) {
			list.sort((a, b) => {
				if (a.kind !== "task" || b.kind !== "task") return 0;
				return a.task.title.localeCompare(b.task.title);
			});
		}
	}

	return {columns: columnDefs, lanes: laneDefs, cells};
}

export function allColumnDefsForView(
	app: App,
	settings: FulcrumSettings,
	snapshot: IndexSnapshot,
	activeProjects: IndexedProject[],
	openTasks: IndexedTask[],
	dimension: KanbanDimension,
): KanbanColumnDef[] {
	return columnDefsForDimension(
		dimension,
		settings.kanbanView,
		snapshot,
		settings,
		app,
		activeProjects,
		openTasks,
	);
}

export {UNASSIGNED_AREA, NO_PROJECT, NO_STATUS};
