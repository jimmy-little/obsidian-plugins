import {describe, expect, it} from "vitest";
import {
	formatQuickNoteLogBlock,
	parseProjectLogLines,
	splitLogSectionIntoBlocks,
} from "../projectNote";
import type {QuickNoteTheme} from "../settingsDefaults";

describe("splitLogSectionIntoBlocks", () => {
	it("groups bullet with indented inline fields", () => {
		const section = `- <!-- fulcrum-log:1000 -->1/1/26 — hello
  type:: ☎️ Communication
  project:: [[Proj]]`;
		const blocks = splitLogSectionIntoBlocks(section);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toContain("type::");
		expect(blocks[0]).toContain("project::");
	});
});

describe("formatQuickNoteLogBlock", () => {
	const theme: QuickNoteTheme = {
		id: "communication",
		label: "Communication",
		emoji: "☎️",
		journal: "Work",
	};

	it("always includes project inline field", () => {
		const block = formatQuickNoteLogBlock({
			text: "test note",
			projectLink: "[[Core Library Admin]]",
			projectLinkField: "project",
			now: new Date("2026-07-01T15:02:31"),
		});
		expect(block).toContain("project:: [[Core Library Admin]]");
		expect(block).toMatch(/fulcrum-log:/);
	});

	it("adds theme fields when theme provided", () => {
		const block = formatQuickNoteLogBlock({
			text: "test note",
			projectLink: "[[Proj]]",
			projectLinkField: "project",
			theme,
			now: new Date("2026-07-01T15:02:31"),
		});
		expect(block).toContain("type:: ☎️ Communication");
		expect(block).toContain("entry:: test note");
		expect(block).toContain("journal:: Work");
		expect(block).toContain("date:: 2026-07-01");
		expect(block).toContain("startDate:: 2026-07-01T15:02:31");
	});
});

describe("parseProjectLogLines", () => {
	it("extracts noteType and entry from multiline block", () => {
		const block = formatQuickNoteLogBlock({
			text: "Stakeholder sync",
			projectLink: "[[Proj]]",
			projectLinkField: "project",
			theme: {
				id: "communication",
				label: "Communication",
				emoji: "☎️",
			},
			now: new Date("2026-07-01T15:02:31"),
		});
		const [entry] = parseProjectLogLines([block]);
		expect(entry?.title).toBe("Stakeholder sync");
		expect(entry?.noteType).toBe("☎️ Communication");
		expect(entry?.rawBlock).toBe(block);
	});
});
