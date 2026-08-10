import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	TFile: class TFile {
		path = "";
		basename = "";
	},
}));

import {TFile} from "obsidian";
import type {IndexedTask} from "../../types";
import {calendarEventKey, taskDueDateToCalendarEvent} from "../calendarEvents";

function makeTask(overrides: Partial<IndexedTask> & {title: string}): IndexedTask {
	const file = new TFile();
	file.path = overrides.file?.path ?? "Tasks/Sample.md";
	file.basename = "Sample";
	return {
		file,
		title: overrides.title,
		status: overrides.status ?? "todo",
		projectFile: null,
		areaFile: null,
		tags: [],
		createdAtMs: 0,
		source: "taskNote",
		trackedMinutes: 0,
		dueDate: overrides.dueDate,
		scheduledDate: overrides.scheduledDate,
		durationMinutes: overrides.durationMinutes,
	};
}

describe("taskDueDateToCalendarEvent", () => {
	it("places date-only due at all-day (untimed)", () => {
		const t = makeTask({title: "Untimed", dueDate: "2026-07-23"});
		const ev = taskDueDateToCalendarEvent(t, () => {}, new Map());
		expect(ev).toMatchObject({
			kind: "task",
			dateIso: "2026-07-23",
			startMinutes: null,
			durationMinutes: null,
			title: "Untimed",
		});
	});

	it("places timed due with start minutes", () => {
		const t = makeTask({title: "Timed", dueDate: "2026-07-23T14:30", durationMinutes: 45});
		const ev = taskDueDateToCalendarEvent(t, () => {}, new Map());
		expect(ev).toMatchObject({
			kind: "task",
			dateIso: "2026-07-23",
			startMinutes: 14 * 60 + 30,
			durationMinutes: 45,
			title: "Timed",
		});
	});

	it("returns null when no due date", () => {
		const t = makeTask({title: "No due"});
		expect(taskDueDateToCalendarEvent(t, () => {}, new Map())).toBeNull();
	});
});

describe("calendarEventKey", () => {
	it("keys task events by path and line", () => {
		const t = makeTask({title: "A", dueDate: "2026-07-23"});
		const ev = taskDueDateToCalendarEvent(t, () => {}, new Map())!;
		expect(calendarEventKey(ev)).toContain("task:");
		expect(calendarEventKey(ev)).toContain(t.file.path);
	});
});
