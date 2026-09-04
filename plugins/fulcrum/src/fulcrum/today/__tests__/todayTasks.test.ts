import {describe, expect, it} from "vitest";
import type {IndexedTask} from "../../types";
import {collectTodayChecklist} from "../todayTasks";

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
});
