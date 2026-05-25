import type {IndexedArea, IndexedProject, IndexedTask} from "../types";

export type KanbanCardKind = "project" | "task";

export type KanbanProjectCard = {
	kind: "project";
	id: string;
	project: IndexedProject;
};

export type KanbanTaskCard = {
	kind: "task";
	id: string;
	task: IndexedTask;
	done: boolean;
};

export type KanbanCard = KanbanProjectCard | KanbanTaskCard;

export type KanbanColumnDef = {
	id: string;
	label: string;
	area?: IndexedArea;
	project?: IndexedProject;
};

export type KanbanLaneDef = {
	id: string;
	label: string;
	area?: IndexedArea;
	project?: IndexedProject;
};

export type KanbanCell = {
	laneId: string;
	columnId: string;
	cards: KanbanCard[];
};

export type KanbanBoard = {
	columns: KanbanColumnDef[];
	lanes: KanbanLaneDef[];
	cells: Map<string, KanbanCard[]>;
};

export function kanbanCellKey(laneId: string, columnId: string): string {
	return `${laneId}\u0000${columnId}`;
}

export function kanbanProjectCardId(project: IndexedProject): string {
	return `p:${project.file.path}`;
}

export function kanbanTaskCardId(task: IndexedTask): string {
	if (task.source === "inline" && task.line != null) {
		return `t:${task.file.path}:${task.line}`;
	}
	return `t:${task.file.path}`;
}
