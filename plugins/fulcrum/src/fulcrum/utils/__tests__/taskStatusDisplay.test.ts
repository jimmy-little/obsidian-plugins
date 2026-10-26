import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	normalizePath: (p: string) => p,
	TFolder: class TFolder {},
	TFile: class TFile {},
}));

import {DEFAULT_SETTINGS} from "../../settingsDefaults";
import type {IndexedTask} from "../../types";
import {resolveInProgressStatus, taskIsBlocked, taskIsInProgress} from "../taskStatusDisplay";

function task(status: string): IndexedTask {
	return {
		file: {path: "t.md", basename: "t.md"} as IndexedTask["file"],
		title: "T",
		status,
		projectFile: null,
		areaFile: null,
		tags: [],
		createdAtMs: 0,
		source: "taskNote",
		trackedMinutes: 0,
	} as never;
}

describe("resolveInProgressStatus / taskIsInProgress", () => {
	it("matches the default hyphenated status", () => {
		const settings = {...DEFAULT_SETTINGS, taskStatuses: "todo, in-progress, done, cancelled"};
		expect(resolveInProgressStatus(settings)).toBe("in-progress");
		expect(taskIsInProgress(task("in-progress"), settings)).toBe(true);
		expect(taskIsInProgress(task("todo"), settings)).toBe(false);
	});

	it("matches a space-separated status (e.g. 'IN PROGRESS')", () => {
		const settings = {...DEFAULT_SETTINGS, taskStatuses: "OPEN, IN PROGRESS, DONE, BLOCKED"};
		expect(resolveInProgressStatus(settings)).toBe("IN PROGRESS");
		expect(taskIsInProgress(task("IN PROGRESS"), settings)).toBe(true);
		expect(taskIsInProgress(task("OPEN"), settings)).toBe(false);
		expect(taskIsInProgress(task("BLOCKED"), settings)).toBe(false);
	});

	it("matches an underscore-separated status", () => {
		const settings = {...DEFAULT_SETTINGS, taskStatuses: "todo, in_progress, done"};
		expect(resolveInProgressStatus(settings)).toBe("in_progress");
		expect(taskIsInProgress(task("in_progress"), settings)).toBe(true);
	});

	it("returns null when no status choice resembles in-progress", () => {
		const settings = {...DEFAULT_SETTINGS, taskStatuses: "todo, done"};
		expect(resolveInProgressStatus(settings)).toBeNull();
		expect(taskIsInProgress(task("todo"), settings)).toBe(false);
	});
});

describe("taskIsBlocked", () => {
	it("matches a status in taskBlockedStatuses (default 'blocked')", () => {
		const settings = {...DEFAULT_SETTINGS, taskBlockedStatuses: "blocked"};
		expect(taskIsBlocked(task("BLOCKED"), settings)).toBe(true);
		expect(taskIsBlocked(task("todo"), settings)).toBe(false);
	});

	it("is false when taskBlockedStatuses is empty", () => {
		const settings = {...DEFAULT_SETTINGS, taskBlockedStatuses: ""};
		expect(taskIsBlocked(task("blocked"), settings)).toBe(false);
	});
});
