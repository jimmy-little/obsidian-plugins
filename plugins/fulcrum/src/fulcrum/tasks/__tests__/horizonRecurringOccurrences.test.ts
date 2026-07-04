import {describe, expect, it} from "vitest";
import type {IndexedTask} from "../../types";
import {
	HORIZON_RECURRING_OCCURRENCE_COUNT,
	horizonRecurringOccurrenceDates,
	resolveCurrentRecurringOccurrenceIso,
} from "../horizonRecurringOccurrences";
import {buildDaySections, taskPrimaryDateIso} from "../tasksViewModel";

function task(partial: Partial<IndexedTask> & {file?: IndexedTask["file"]}): IndexedTask {
	return {
		file: {path: "tasks/planning.md", basename: "planning.md"} as IndexedTask["file"],
		title: "Day Planning",
		status: "todo",
		projectFile: null,
		areaFile: null,
		tags: [],
		createdAtMs: 0,
		source: "taskNote",
		trackedMinutes: 0,
		scheduledDate: "2026-06-30",
		dueDate: "2027-06-30",
		recurrence: "DTSTART:20260630;FREQ=DAILY",
		...partial,
	};
}

describe("taskPrimaryDateIso for recurring tasks", () => {
	it("prefers scheduled over far-future due", () => {
		expect(taskPrimaryDateIso(task({}))).toBe("2026-06-30");
	});
});

describe("horizonRecurringOccurrenceDates", () => {
	it("returns current plus next five daily occurrences", () => {
		const dates = horizonRecurringOccurrenceDates(task({}), "2026-06-30");
		expect(dates).toHaveLength(HORIZON_RECURRING_OCCURRENCE_COUNT);
		expect(dates[0]).toBe("2026-06-30");
		expect(dates[1]).toBe("2026-07-01");
		expect(dates[5]).toBe("2026-07-05");
	});

	it("skips completed instances when finding current", () => {
		const dates = horizonRecurringOccurrenceDates(
			task({
				completeInstances: ["2026-06-30"],
				scheduledDate: "2026-06-30",
			}),
			"2026-06-30",
		);
		expect(dates[0]).toBe("2026-07-01");
	});

	it("resolveCurrentRecurringOccurrenceIso matches first horizon date", () => {
		const t = task({
			completeInstances: ["2026-07-01"],
			scheduledDate: "2026-07-13",
			dueDate: "2026-06-29",
		});
		expect(resolveCurrentRecurringOccurrenceIso(t)).toBe("2026-07-13");
		expect(horizonRecurringOccurrenceDates(t, "2026-07-01")[0]).toBe("2026-07-13");
	});
});

describe("buildDaySections with recurring tasks", () => {
	const today = "2026-06-30";
	const settings = {
		taskSidebarSortBy: "due",
		taskSidebarSortDir: "asc",
	} as import("../../settingsDefaults").FulcrumSettings;

	it("places recurring task on today and future day sections", () => {
		const sections = buildDaySections([task({})], settings, 7, today);
		const todaySection = sections.find((s) => s.key === today);
		expect(todaySection?.items.some((i) => i.kind === "task" && i.task.title === "Day Planning")).toBe(
			true,
		);
		const tomorrow = sections.find((s) => s.key === "2026-07-01");
		expect(tomorrow?.items.some((i) => i.kind === "task")).toBe(true);
	});

	it("does not bucket recurring parent by far-future due alone", () => {
		const sections = buildDaySections([task({})], settings, 7, today);
		const futureOnly = sections.find((s) => s.key === "__future__");
		const hasPlanning = futureOnly?.items.some(
			(i) => i.kind === "task" && i.task.title === "Day Planning",
		);
		expect(hasPlanning).toBeFalsy();
	});
});
