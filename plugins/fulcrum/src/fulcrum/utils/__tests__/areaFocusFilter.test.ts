import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	TFile: class TFile {
		path = "";
		basename = "";
	},
}));

import {TFile} from "obsidian";
import type {IndexSnapshot, IndexedProject} from "../../types";
import {
	formatNameList,
	formatShowingAreaFilterSubtext,
	listEnabledAreaNames,
	quickStartPassesAreaFilter,
	taskPassesAreaFilter,
	type AreaFilterPanelGroup,
	type AreaFilterState,
} from "../areaFocusFilter";

function makeProject(path: string, areaPath: string): IndexedProject {
	const file = new TFile();
	file.path = path;
	const areaFile = new TFile();
	areaFile.path = areaPath;
	return {
		file,
		name: file.basename,
		status: "active",
		areaFile,
		areaFiles: [areaFile],
	};
}

function emptySnapshot(projects: IndexedProject[] = []): IndexSnapshot {
	return {
		projects,
		areas: [],
		tasks: [],
		meetings: [],
		plannerEvents: [],
		personWorksWith: new Map(),
		rebuiltAt: 0,
	};
}

const filteredState: AreaFilterState = {
	disabledLifeModes: ["personal"],
	disabledAreaPaths: [],
};

describe("quickStartPassesAreaFilter", () => {
	it("always shows manual template timers when area filter is active", () => {
		const passes = quickStartPassesAreaFilter(
			{kind: "template", projectSourcePath: null, area: null},
			emptySnapshot(),
			filteredState,
			new Map(),
		);
		expect(passes).toBe(true);
	});

	it("filters project-folder quick start items by area focus", () => {
		const project = makeProject("Projects/Work Thing.md", "Areas/Work.md");
		const snapshot = emptySnapshot([project]);
		const lifeModeMap = new Map([["Areas/Work.md", "Work"]]);

		const passes = quickStartPassesAreaFilter(
			{kind: "project", projectSourcePath: project.file.path},
			snapshot,
			filteredState,
			lifeModeMap,
		);
		expect(passes).toBe(true);

		const blocked = quickStartPassesAreaFilter(
			{
				kind: "project",
				projectSourcePath: project.file.path,
			},
			snapshot,
			{disabledLifeModes: ["work"], disabledAreaPaths: []},
			lifeModeMap,
		);
		expect(blocked).toBe(false);
	});

	it("hides unclassified project items when area filter is active", () => {
		const passes = quickStartPassesAreaFilter(
			{kind: "project", projectSourcePath: null, area: null},
			emptySnapshot(),
			filteredState,
			new Map(),
		);
		expect(passes).toBe(false);
	});
});

describe("taskPassesAreaFilter", () => {
	it("keeps a task when its project area is enabled even if the task area is elsewhere", () => {
		const project = makeProject("Projects/Core Library Admin.md", "Areas/Work Admin.md");
		const taskArea = new TFile();
		taskArea.path = "Areas/Other.md";
		const snapshot = emptySnapshot([project]);
		const task = {
			file: {path: "tasks/x.md", basename: "x.md"},
			title: "Overdue",
			status: "todo",
			projectFile: project.file,
			areaFile: taskArea,
			tags: [],
			createdAtMs: 0,
			source: "taskNote" as const,
			trackedMinutes: 0,
		};
		const lifeModeMap = new Map([
			["Areas/Work Admin.md", "Work"],
			["Areas/Other.md", "Other"],
		]);
		expect(
			taskPassesAreaFilter(
				task as never,
				snapshot,
				{disabledLifeModes: ["other"], disabledAreaPaths: []},
				lifeModeMap,
			),
		).toBe(true);
	});
});

describe("formatShowingAreaFilterSubtext", () => {
	const groups: AreaFilterPanelGroup[] = [
		{
			lifeModeKey: "work",
			label: "Work",
			sectionEnabled: true,
			areas: [
				{path: "a", name: "Core Library", colorCss: "", enabled: true},
				{path: "b", name: "Taxonomy Services", colorCss: "", enabled: true},
				{path: "c", name: "Hidden Area", colorCss: "", enabled: false},
			],
		},
		{
			lifeModeKey: "personal",
			label: "Personal",
			sectionEnabled: true,
			areas: [{path: "d", name: "Personal Growth", colorCss: "", enabled: true}],
		},
	];

	it("lists only enabled area names", () => {
		expect(listEnabledAreaNames(groups)).toEqual([
			"Core Library",
			"Taxonomy Services",
			"Personal Growth",
		]);
	});

	it("formats the dashboard Showing line", () => {
		expect(formatShowingAreaFilterSubtext(groups)).toBe(
			"Showing Core Library, Taxonomy Services, and Personal Growth",
		);
	});

	it("truncates long lists with and N more", () => {
		expect(formatNameList(["A", "B", "C", "D", "E"], 4)).toBe("A, B, C, and 2 more");
	});
});
