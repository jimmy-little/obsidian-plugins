import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	TFile: class TFile {
		path = "";
		basename = "";
		parent: {path: string} | null = null;
	},
}));

import {TFile} from "obsidian";
import type {IndexedProject} from "../../types";
import {
	firstLegacyLinkedProjectFileInLine,
	firstLinkedProjectFileInLine,
	firstPlusLinkedProjectFileInLine,
	formatInlineProjectLink,
	resolveIndexedProjectByDisplay,
	stripInlineProjectLinks,
} from "../projectLink";

function makeProject(path: string, name: string): IndexedProject {
	const file = new TFile();
	file.path = path;
	file.basename = path.split("/").pop() ?? path;
	const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
	file.parent = folder ? ({path: folder} as never) : null;
	return {
		file,
		name,
		status: "active",
		areaFile: null,
		areaFiles: [],
	};
}

function mockApp(
	links: Record<string, {path: string} | null>,
	options?: {fileToLinktext?: Record<string, string>},
) {
	return {
		metadataCache: {
			getFirstLinkpathDest: (link: string) => {
				const hit = links[link];
				if (!hit) return null;
				const file = new TFile();
				file.path = hit.path;
				file.basename = hit.path.split("/").pop() ?? hit.path;
				const folder = hit.path.includes("/") ? hit.path.slice(0, hit.path.lastIndexOf("/")) : "";
				file.parent = folder ? ({path: folder} as never) : null;
				return file;
			},
			fileToLinktext: (file: TFile) => options?.fileToLinktext?.[file.path] ?? file.basename,
		},
	};
}

describe("formatInlineProjectLink", () => {
	it("wraps basename in +[[ ]]", () => {
		expect(formatInlineProjectLink("Maestro Auth")).toBe("+[[Maestro Auth]]");
	});
});

describe("stripInlineProjectLinks", () => {
	it("removes +[[project]] tokens", () => {
		expect(
			stripInlineProjectLinks("Read [[OIDC]] doc +[[Maestro Auth]] #task"),
		).toBe("Read [[OIDC]] doc #task");
	});
});

describe("resolveIndexedProjectByDisplay", () => {
	it("matches indexed project name even when Obsidian resolves elsewhere", () => {
		const project = makeProject(
			"40 Projects/IN PROGRESS/Maestro Auth KT/Maestro Auth KT.md",
			"Maestro Auth KT",
		);
		const app = mockApp({
			"Maestro Auth KT": {path: "10 Reference/Maestro Auth KT.md"},
		});
		const dest = resolveIndexedProjectByDisplay(
			app as never,
			"Maestro Auth KT",
			"meetings/note.md",
			[project],
			new Set([project.file.path]),
		);
		expect(dest?.path).toBe(project.file.path);
	});
});

describe("firstPlusLinkedProjectFileInLine", () => {
	const projectPaths = new Set(["projects/Maestro Auth.md", "projects/OIDC.md"]);
	const indexedProjects = [
		makeProject("projects/Maestro Auth.md", "Maestro Auth"),
		makeProject("projects/OIDC.md", "OIDC"),
	];
	const app = mockApp({
		OIDC: {path: "notes/OIDC.md"},
		"Maestro Auth": {path: "projects/Maestro Auth.md"},
	});

	it("uses +[[project]] and ignores earlier page wikilinks", () => {
		const line =
			"- [ ] Read up on [[OIDC]] and populate document +[[Maestro Auth]] 📅 2026-06-12";
		const dest = firstPlusLinkedProjectFileInLine(
			app as never,
			line,
			"meetings/note.md",
			projectPaths,
			indexedProjects,
		);
		expect(dest?.path).toBe("projects/Maestro Auth.md");
	});

	it("returns null when only page wikilinks are present", () => {
		const line = "- [ ] Read up on [[OIDC]] and populate document";
		expect(
			firstPlusLinkedProjectFileInLine(
				app as never,
				line,
				"meetings/note.md",
				projectPaths,
				indexedProjects,
			),
		).toBeNull();
	});
});

describe("firstLinkedProjectFileInLine", () => {
	const projectPaths = new Set(["projects/Maestro Auth.md", "projects/OIDC.md"]);
	const indexedProjects = [
		makeProject("projects/Maestro Auth.md", "Maestro Auth"),
		makeProject("projects/OIDC.md", "OIDC"),
	];

	it("prefers +[[project]] over legacy [[project]]", () => {
		const app = mockApp({
			OIDC: {path: "projects/OIDC.md"},
			"Maestro Auth": {path: "projects/Maestro Auth.md"},
		});
		const line = "- [ ] Task [[OIDC]] +[[Maestro Auth]]";
		expect(
			firstLinkedProjectFileInLine(
				app as never,
				line,
				"x.md",
				projectPaths,
				indexedProjects,
			)?.path,
		).toBe("projects/Maestro Auth.md");
	});

	it("falls back to legacy [[project]] when no plus link exists", () => {
		const app = mockApp({
			"Maestro Auth": {path: "projects/Maestro Auth.md"},
		});
		const line = "- [ ] Task [[Maestro Auth]] #task";
		expect(
			firstLinkedProjectFileInLine(
				app as never,
				line,
				"x.md",
				projectPaths,
				indexedProjects,
			)?.path,
		).toBe("projects/Maestro Auth.md");
	});
});

describe("firstLegacyLinkedProjectFileInLine", () => {
	it("skips wikilinks immediately preceded by +", () => {
		const projectPaths = new Set(["projects/Maestro Auth.md"]);
		const indexedProjects = [makeProject("projects/Maestro Auth.md", "Maestro Auth")];
		const app = mockApp({
			"Maestro Auth": {path: "projects/Maestro Auth.md"},
		});
		const line = "- [ ] Task +[[Maestro Auth]]";
		expect(
			firstLegacyLinkedProjectFileInLine(
				app as never,
				line,
				"x.md",
				projectPaths,
				indexedProjects,
			),
		).toBeNull();
	});
});
