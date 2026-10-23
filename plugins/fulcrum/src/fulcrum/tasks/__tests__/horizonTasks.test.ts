import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	TFile: class TFile {
		path = "";
		basename = "";
	},
}));

import {TFile} from "obsidian";
import type {FulcrumSettings} from "../../settingsDefaults";
import type {IndexSnapshot, IndexedTask} from "../../types";
import {collectHorizonTasks, collectOpenTasks} from "../horizonTasks";

function file(path: string): TFile {
	const f = new TFile();
	f.path = path;
	f.basename = path.replace(/\.md$/i, "");
	return f;
}

function task(partial: Partial<IndexedTask> & {title: string}): IndexedTask {
	return {
		file: file(`${partial.title}.md`),
		title: partial.title,
		status: partial.status ?? "todo",
		projectFile: partial.projectFile ?? null,
		areaFile: null,
		tags: [],
		createdAtMs: 0,
		source: "taskNote",
		trackedMinutes: 0,
		dueDate: partial.dueDate,
		scheduledDate: partial.scheduledDate,
	};
}

function snapshot(tasks: IndexedTask[]): IndexSnapshot {
	return {
		projects: [],
		areas: [],
		tasks,
		meetings: [],
		plannerEvents: [],
		personWorksWith: new Map(),
		rebuiltAt: 0,
	};
}

const openFilter = {disabledLifeModes: [], disabledAreaPaths: []};

describe("collectOpenTasks", () => {
	it("excludes done tasks and keeps undated and unlinked open tasks", () => {
		const open = collectOpenTasks(
			snapshot([
				task({title: "Done", status: "done"}),
				task({title: "Scheduled", scheduledDate: "2026-09-02"}),
				task({title: "Undated"}),
			]),
			openFilter,
			new Map(),
			new Set(["done"]),
		);
		expect(open.map((t) => t.title).sort()).toEqual(["Scheduled", "Undated"]);
	});

	it("keeps only tasks for the project-list multi-select", () => {
		const core = {path: "40 Projects/Core Library Admin.md"} as IndexedTask["projectFile"];
		const other = {path: "40 Projects/Other.md"} as IndexedTask["projectFile"];
		const open = collectOpenTasks(
			snapshot([
				task({title: "Core", projectFile: core}),
				task({title: "Other", projectFile: other}),
			]),
			openFilter,
			new Map(),
			new Set(["done"]),
			new Set(["40 Projects/Core Library Admin.md"]),
		);
		expect(open.map((t) => t.title)).toEqual(["Core"]);
	});
});

describe("collectHorizonTasks", () => {
	const settings = {
		taskSourceMode: "both",
		taskSidebarFilterUncheckedStatus: [],
		taskSidebarFilterUncheckedProject: ["40 Projects/Core Library Admin.md"],
		taskSidebarFilterUncheckedSource: [],
	} as unknown as FulcrumSettings;

	it("uses the project-list multi-select, not leftover project facet unchecks", () => {
		const core = {path: "40 Projects/Core Library Admin.md"} as IndexedTask["projectFile"];
		const tasks = collectHorizonTasks(
			snapshot([task({title: "Core", projectFile: core, dueDate: "2026-09-08"})]),
			settings,
			openFilter,
			new Map(),
			new Set(["done"]),
			new Set(),
		);
		expect(tasks.map((t) => t.title)).toEqual(["Core"]);
	});
});
