import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	TFile: class TFile {
		path = "";
		basename = "";
	},
}));

import {TFile} from "obsidian";
import type {IndexedProject} from "../../types";
import {includeUnassignedProjectsForAreaKanban} from "../areaFocusFilter";

function makeProject(path: string, areaPaths: string[] = []): IndexedProject {
	const file = new TFile();
	file.path = path;
	file.basename = path.split("/").pop() ?? path;
	const areaFiles = areaPaths.map((ap) => {
		const af = new TFile();
		af.path = ap;
		af.basename = ap.split("/").pop() ?? ap;
		return af;
	});
	return {
		file,
		name: file.basename.replace(/\.md$/i, ""),
		status: "active",
		areaFile: areaFiles[0] ?? null,
		areaFiles,
	};
}

describe("includeUnassignedProjectsForAreaKanban", () => {
	it("adds zero-area projects that the area filter dropped", () => {
		const assigned = makeProject("Projects/A.md", ["Areas/Work.md"]);
		const unassigned = makeProject("Projects/B.md", []);
		const filtered = [assigned];
		const candidates = [assigned, unassigned];
		const merged = includeUnassignedProjectsForAreaKanban(filtered, candidates);
		expect(merged.map((p) => p.file.path)).toEqual([
			"Projects/A.md",
			"Projects/B.md",
		]);
	});

	it("does not duplicate projects already in the filtered list", () => {
		const unassigned = makeProject("Projects/B.md", []);
		const merged = includeUnassignedProjectsForAreaKanban([unassigned], [unassigned]);
		expect(merged).toHaveLength(1);
	});

	it("is a no-op when candidates is empty (non-area kanban axes)", () => {
		const assigned = makeProject("Projects/A.md", ["Areas/Work.md"]);
		expect(includeUnassignedProjectsForAreaKanban([assigned], [])).toEqual([assigned]);
	});
});
