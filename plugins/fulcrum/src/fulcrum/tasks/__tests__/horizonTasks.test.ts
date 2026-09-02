import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	TFile: class TFile {
		path = "";
		basename = "";
	},
}));

import {TFile} from "obsidian";
import type {IndexSnapshot, IndexedTask} from "../../types";
import {collectOpenTasks} from "../horizonTasks";

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
});
