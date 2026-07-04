import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	TFile: class TFile {
		path = "";
		basename = "";
	},
}));

import {TFile} from "obsidian";
import type {IndexedProject} from "../../types";
import {
	parsePlannerCheckboxBody,
	plannerTrackedMinutesForProject,
} from "../plannerBlockParse";
import type {IndexedPlannerEvent} from "../../types";

function makeProject(path: string, name: string): IndexedProject {
	const file = new TFile();
	file.path = path;
	file.basename = path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
	return {
		file,
		name,
		status: "active",
		areaFile: null,
		areaFiles: [],
	};
}

function mockApp(links: Record<string, {path: string} | null>) {
	return {
		metadataCache: {
			getFirstLinkpathDest: (link: string) => {
				const hit = links[link];
				if (!hit) return null;
				const f = new TFile();
				f.path = hit.path;
				f.basename = hit.path.split("/").pop()?.replace(/\.md$/i, "") ?? hit.path;
				return f;
			},
		},
	} as never;
}

describe("parsePlannerCheckboxBody", () => {
	const projects = [makeProject("Areas/Work/NatGeo.md", "NatGeo Mondeca Integration")];
	const projectPaths = new Set(projects.map((p) => p.file.path));
	const app = mockApp({
		"NatGeo Mondeca Integration": {path: "Areas/Work/NatGeo.md"},
	});

	it("parses +[[project]], strips it from the timeline title, and credits done blocks", () => {
		const titleBare =
			"09:30 - 10:00 NatGeo uploads +[[NatGeo Mondeca Integration]]";
		const parsed = parsePlannerCheckboxBody({
			titleBare,
			fullText: titleBare,
			defaultDurationMinutes: 30,
			isChecked: true,
			app,
			sourcePath: "Daily/2026-06-23.md",
			projectPaths,
			indexedProjects: projects,
		});

		expect(parsed.title).toBe("NatGeo uploads");
		expect(parsed.projectFile?.path).toBe("Areas/Work/NatGeo.md");
		expect(parsed.trackedMinutes).toBe(30);
		expect(parsed.startMinutes).toBe(9 * 60 + 30);
	});

	it("does not credit unchecked blocks", () => {
		const parsed = parsePlannerCheckboxBody({
			titleBare: "09:30 - 10:00 Deep work +[[NatGeo Mondeca Integration]]",
			fullText: "09:30 - 10:00 Deep work +[[NatGeo Mondeca Integration]]",
			defaultDurationMinutes: 30,
			isChecked: false,
			app,
			sourcePath: "Daily/2026-06-23.md",
			projectPaths,
			indexedProjects: projects,
		});

		expect(parsed.trackedMinutes).toBe(0);
	});
});

describe("plannerTrackedMinutesForProject", () => {
	const projectFile = new TFile();
	projectFile.path = "Areas/Work/NatGeo.md";

	const events: IndexedPlannerEvent[] = [
		{
			file: new TFile(),
			line: 1,
			dateIso: "2026-06-20",
			title: "Uploads",
			status: "done",
			startMinutes: 570,
			durationMinutes: 30,
			projectFile,
			trackedMinutes: 30,
		},
		{
			file: new TFile(),
			line: 2,
			dateIso: "2026-06-23",
			title: "Planning",
			status: "todo",
			startMinutes: 600,
			durationMinutes: 30,
			projectFile,
			trackedMinutes: 0,
		},
	];

	it("sums only done blocks for the project", () => {
		expect(
			plannerTrackedMinutesForProject(events, "Areas/Work/NatGeo.md"),
		).toBe(30);
	});

	it("respects the horizon cutoff", () => {
		const sinceMs = Date.parse("2026-06-22T12:00:00");
		expect(
			plannerTrackedMinutesForProject(events, "Areas/Work/NatGeo.md", {sinceMs}),
		).toBe(0);
	});
});
