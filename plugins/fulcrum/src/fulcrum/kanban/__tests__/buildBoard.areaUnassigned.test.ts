import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	TFile: class TFile {
		path = "";
		basename = "";
		name = "";
	},
	App: class App {},
}));

import {TFile} from "obsidian";
import type {App} from "obsidian";
import {DEFAULT_SETTINGS} from "../../settingsDefaults";
import type {IndexedArea, IndexedProject, IndexSnapshot} from "../../types";
import {buildKanbanBoard, UNASSIGNED_AREA} from "../buildBoard";

function makeFile(path: string): TFile {
	const f = new TFile();
	f.path = path;
	f.basename = path.split("/").pop() ?? path;
	f.name = f.basename;
	return f;
}

function makeArea(path: string, name: string): IndexedArea {
	return {
		file: makeFile(path),
		name,
		icon: undefined,
		color: undefined,
		lifeMode: "Work",
	};
}

function makeProject(path: string, area?: IndexedArea): IndexedProject {
	const file = makeFile(path);
	const areaFiles = area ? [area.file] : [];
	return {
		file,
		name: file.basename.replace(/\.md$/i, ""),
		status: "active",
		areaFile: areaFiles[0] ?? null,
		areaFiles,
		areaName: area?.name,
	};
}

describe("buildKanbanBoard area columns", () => {
	it("always includes an Unassigned column for projects by area", () => {
		const area = makeArea("Areas/Work.md", "Work");
		const project = makeProject("Projects/Assigned.md", area);
		const snapshot: IndexSnapshot = {
			projects: [project],
			areas: [area],
			tasks: [],
			meetings: [],
			plannerEvents: [],
			personWorksWith: new Map(),
			rebuiltAt: 0,
		};
		const settings = {
			...DEFAULT_SETTINGS,
			kanbanView: "projects" as const,
			kanbanColumnBy: "area" as const,
			kanbanSwimlaneBy: "none" as const,
		};
		const board = buildKanbanBoard(
			{} as App,
			settings,
			snapshot,
			[project],
			[],
		);
		expect(board.columns.some((c) => c.id === UNASSIGNED_AREA)).toBe(true);
		expect(board.columns.find((c) => c.id === UNASSIGNED_AREA)?.label).toBe("Unassigned");
	});

	it("places projects with no area into the Unassigned column", () => {
		const area = makeArea("Areas/Work.md", "Work");
		const assigned = makeProject("Projects/Assigned.md", area);
		const orphan = makeProject("Projects/Orphan.md");
		const snapshot: IndexSnapshot = {
			projects: [assigned, orphan],
			areas: [area],
			tasks: [],
			meetings: [],
			plannerEvents: [],
			personWorksWith: new Map(),
			rebuiltAt: 0,
		};
		const settings = {
			...DEFAULT_SETTINGS,
			kanbanView: "projects" as const,
			kanbanColumnBy: "area" as const,
			kanbanSwimlaneBy: "none" as const,
		};
		const board = buildKanbanBoard(
			{} as App,
			settings,
			snapshot,
			[assigned, orphan],
			[],
		);
		const unassignedCards =
			board.cells.get(`__all__\u0000${UNASSIGNED_AREA}`) ?? [];
		expect(unassignedCards.map((c) => (c.kind === "project" ? c.project.file.path : ""))).toEqual([
			"Projects/Orphan.md",
		]);
	});
});
