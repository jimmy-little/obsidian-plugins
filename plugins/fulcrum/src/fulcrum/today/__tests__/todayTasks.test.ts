import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	normalizePath: (p: string) => p,
	TFolder: class TFolder {},
	TFile: class TFile {},
}));
import type {IndexedTask} from "../../types";
import {collectFocalDoneDayEntries, collectTodayChecklist, mergeTodayDayEntries} from "../todayTasks";

function task(partial: Partial<IndexedTask>): IndexedTask {
	return {
		file: {path: `${partial.title ?? "t"}.md`, basename: `${partial.title ?? "t"}.md`} as IndexedTask["file"],
		title: "Task",
		status: "todo",
		projectFile: null,
		areaFile: null,
		tags: [],
		createdAtMs: 0,
		source: "taskNote",
		trackedMinutes: 0,
		...partial,
	};
}

describe("collectTodayChecklist", () => {
	const today = "2026-09-04";

	it("puts due/scheduled on the focal day and overdue in outstanding", () => {
		const list = collectTodayChecklist(
			[
				task({title: "Today due", dueDate: today}),
				task({title: "Today sched", scheduledDate: today}),
				task({title: "Overdue", dueDate: "2026-09-01"}),
				task({title: "Tomorrow", dueDate: "2026-09-05"}),
			],
			today,
			today,
		);
		expect(list.day.map((e) => e.task.title).sort()).toEqual(["Today due", "Today sched"]);
		expect(list.outstanding.map((t) => t.title)).toEqual(["Overdue"]);
		expect(list.unscheduled).toEqual([]);
	});

	it("does not duplicate a focal-day task in outstanding", () => {
		const list = collectTodayChecklist(
			[task({title: "Due today", dueDate: today, scheduledDate: "2026-09-01"})],
			today,
			today,
		);
		expect(list.day).toHaveLength(1);
		expect(list.outstanding).toHaveLength(0);
	});

	it("when viewing another day, still lists overdue vs today", () => {
		const list = collectTodayChecklist(
			[
				task({title: "Saturday", dueDate: "2026-09-05"}),
				task({title: "Late", dueDate: "2026-09-01"}),
			],
			"2026-09-05",
			today,
		);
		expect(list.day.map((e) => e.task.title)).toEqual(["Saturday"]);
		expect(list.outstanding.map((t) => t.title)).toEqual(["Late"]);
	});

	it("keeps focal-day and completed-today tasks, and drops older done work", () => {
		const done = new Set(["done"]);
		const entries = collectFocalDoneDayEntries(
			[
				task({title: "Finished today", status: "done", dueDate: today}),
				task({title: "Closed overdue", status: "done", dueDate: "2026-09-01", completedDate: today}),
				task({title: "Old", status: "done", dueDate: "2026-09-01", completedDate: "2026-09-01"}),
				task({title: "Still open", status: "todo", dueDate: today}),
				task({
					title: "Recurring hit",
					status: "todo",
					recurrence: "FREQ=DAILY",
					completeInstances: [today],
					scheduledDate: today,
				}),
			],
			today,
			done,
		);
		expect(entries.map((e) => e.task.title).sort()).toEqual([
			"Closed overdue",
			"Finished today",
			"Recurring hit",
		]);
		expect(entries.find((e) => e.task.title === "Recurring hit")?.occurrenceDateIso).toBe(today);
	});

	it("merges done rows without duplicating an open focal-day task", () => {
		const open = task({title: "Open", dueDate: today});
		const done = task({title: "Done", status: "done", dueDate: today});
		const merged = mergeTodayDayEntries([{task: open}], [{task: open}, {task: done}]);
		expect(merged.map((e) => e.task.title)).toEqual(["Open", "Done"]);
	});

	it("lists undated tasks as unscheduled", () => {
		const list = collectTodayChecklist(
			[task({title: "Backlog"}), task({title: "Today", dueDate: today})],
			today,
			today,
		);
		expect(list.unscheduled.map((t) => t.title)).toEqual(["Backlog"]);
		expect(list.day.map((e) => e.task.title)).toEqual(["Today"]);
	});
});
