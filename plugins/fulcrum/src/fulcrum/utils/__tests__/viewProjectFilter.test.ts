import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	TFile: class TFile {
		path = "";
		basename = "";
	},
}));

import {TFile} from "obsidian";
import type {IndexedProject, IndexedTask} from "../../types";
import {includeProjectsReferencedByOpenTasks} from "../viewProjectFilter";

function makeProject(path: string, status = "in progress"): IndexedProject {
	const file = new TFile();
	file.path = path;
	file.basename = path.split("/").pop() ?? path;
	return {
		file,
		name: file.basename.replace(/\.md$/i, ""),
		status,
		areaFile: null,
		areaFiles: [],
	};
}

function makeTask(projectPath: string): IndexedTask {
	const file = new TFile();
	file.path = `${projectPath}-task.md`;
	const projectFile = new TFile();
	projectFile.path = projectPath;
	return {
		file,
		title: "Open",
		status: "todo",
		projectFile,
		areaFile: null,
		tags: [],
		createdAtMs: 0,
		source: "taskNote",
		trackedMinutes: 0,
	};
}

describe("includeProjectsReferencedByOpenTasks", () => {
	it("adds an ONGOING project that has open tasks but is missing from the active list", () => {
		const inProgress = makeProject("40 Projects/IN PROGRESS/Admin APIs.md", "in progress");
		const ongoing = makeProject(
			"40 Projects/ONGOING/Core Platform Admin/Core Library Admin.md",
			"ongoing",
		);
		const merged = includeProjectsReferencedByOpenTasks(
			[inProgress],
			[inProgress, ongoing],
			[makeTask(ongoing.file.path)],
		);
		expect(merged.map((p) => p.file.path)).toEqual([
			inProgress.file.path,
			ongoing.file.path,
		]);
	});

	it("does not duplicate a project already in the active list", () => {
		const inProgress = makeProject("40 Projects/IN PROGRESS/Admin APIs.md");
		const merged = includeProjectsReferencedByOpenTasks(
			[inProgress],
			[inProgress],
			[makeTask(inProgress.file.path)],
		);
		expect(merged).toHaveLength(1);
	});

	it("ignores tasks whose project is not indexed", () => {
		const inProgress = makeProject("40 Projects/IN PROGRESS/Admin APIs.md");
		const merged = includeProjectsReferencedByOpenTasks(
			[inProgress],
			[inProgress],
			[makeTask("40 Projects/Missing.md")],
		);
		expect(merged).toEqual([inProgress]);
	});
});
