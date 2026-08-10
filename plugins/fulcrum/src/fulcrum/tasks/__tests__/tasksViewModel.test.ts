import {describe, expect, it} from "vitest";
import type {FulcrumSettings} from "../../settingsDefaults";
import type {IndexedMeeting, IndexedTask} from "../../types";
import {
	buildDaySections,
	buildWeekStripBlocks,
	filterOpenTasksForTasksView,
	indexedTaskFromPlannerEvent,
	mergeDayItems,
	taskPrimaryDateIso,
	tasksViewItemKey,
	unscheduledSectionDefaultExpanded,
} from "../tasksViewModel";
import type {IndexedPlannerEvent} from "../../types";

function task(partial: Partial<IndexedTask> & {dueDate?: string; scheduledDate?: string}): IndexedTask {
	return {
		file: {path: "t.md", basename: "t.md"} as IndexedTask["file"],
		title: "Test",
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

function meeting(
	partial: Partial<IndexedMeeting> & {date?: string; title?: string},
): IndexedMeeting {
	return {
		file: {path: "m.md", basename: "m.md"} as IndexedMeeting["file"],
		projectFile: null,
		...partial,
	};
}

describe("taskPrimaryDateIso", () => {
	it("prefers due over scheduled for non-recurring tasks", () => {
		expect(
			taskPrimaryDateIso(task({dueDate: "2026-06-10", scheduledDate: "2026-06-05"})),
		).toBe("2026-06-10");
	});

	it("falls back to scheduled", () => {
		expect(taskPrimaryDateIso(task({scheduledDate: "2026-06-05"}))).toBe("2026-06-05");
	});
});

describe("buildWeekStripBlocks", () => {
	it("counts past and future buckets", () => {
		const today = "2026-06-29";
		const blocks = buildWeekStripBlocks(
			[
				task({dueDate: "2026-06-20"}),
				task({dueDate: today}),
				task({dueDate: "2026-07-10"}),
			],
			today,
		);
		expect(blocks[0]?.dayName).toBe("Past");
		expect(blocks[0]?.label).toBe("Past");
		expect(blocks[0]?.count).toBe(1);
		expect(blocks[1]?.label).toBe("Today");
		expect(blocks[1]?.count).toBe(1);
		expect(blocks[blocks.length - 1]?.label).toBe("Future");
		expect(blocks[blocks.length - 1]?.count).toBe(1);
	});

	it("ignores meetings (tasks only)", () => {
		const today = "2026-06-29";
		const blocks = buildWeekStripBlocks([], today);
		const todayBlock = blocks.find((b) => b.isToday);
		expect(todayBlock?.count).toBe(0);
	});
});

describe("mergeDayItems", () => {
	const settings = {
		taskSidebarSortBy: "due",
		taskSidebarSortDir: "asc",
	} as FulcrumSettings;

	it("places timed meeting before untimed tasks", () => {
		const items = mergeDayItems(
			[{task: task({title: "Later", dueDate: "2026-06-29"})}],
			[meeting({title: "Standup", date: "2026-06-29T09:00"})],
			[],
			settings,
		);
		expect(items[0]?.kind).toBe("meeting");
		expect(items[1]?.kind).toBe("task");
	});

	it("sorts timed meetings chronologically among timed tasks", () => {
		const items = mergeDayItems(
			[{task: task({title: "Afternoon", scheduledDate: "2026-06-29T14:00"})}],
			[meeting({title: "Morning", date: "2026-06-29T09:00"})],
			[],
			settings,
		);
		expect(items.map((i) => i.kind)).toEqual(["meeting", "task"]);
		if (items[0]?.kind === "meeting") {
			expect(items[0].startMinutes).toBe(9 * 60);
		}
	});

	it("places untimed meetings before untimed tasks", () => {
		const items = mergeDayItems(
			[
				{task: task({title: "Task B", dueDate: "2026-06-29"})},
				{task: task({title: "Task A", dueDate: "2026-06-29"})},
			],
			[meeting({title: "All day sync", date: "2026-06-29"})],
			[],
			settings,
		);
		expect(items[0]?.kind).toBe("meeting");
		expect(items.filter((i) => i.kind === "task").length).toBe(2);
	});

	it("sorts timed meetings chronologically when no timed tasks exist", () => {
		const items = mergeDayItems(
			[{task: task({title: "Untimed", dueDate: "2026-06-29"})}],
			[
				meeting({title: "Late", date: "2026-06-29T15:00"}),
				meeting({title: "Early", date: "2026-06-29T08:00"}),
			],
			[],
			settings,
		);
		expect(items[0]?.kind).toBe("meeting");
		expect(items[1]?.kind).toBe("meeting");
		if (items[0]?.kind === "meeting") expect(items[0].meeting.title).toBe("Early");
		if (items[1]?.kind === "meeting") expect(items[1].meeting.title).toBe("Late");
		expect(items[2]?.kind).toBe("task");
	});
});

describe("buildDaySections with meetings", () => {
	const today = "2026-06-29";
	const settings = {
		taskSidebarSortBy: "due",
		taskSidebarSortDir: "asc",
	} as FulcrumSettings;

	it("includes meetings in day sections without inflating task count", () => {
		const sections = buildDaySections(
			[task({dueDate: today})],
			settings,
			7,
			today,
			{meetings: [meeting({date: today, title: "Sync"})]},
		);
		const todaySection = sections.find((s) => s.key === today);
		expect(todaySection?.tasks.length).toBe(1);
		expect(todaySection?.items.length).toBe(2);
	});

	it("skips past meetings", () => {
		const sections = buildDaySections(
			[],
			settings,
			7,
			today,
			{meetings: [meeting({date: "2026-06-20", title: "Old"})]},
		);
		const hasMeeting = sections.some((s) =>
			s.items.some((i) => i.kind === "meeting"),
		);
		expect(hasMeeting).toBe(false);
	});
});

describe("tasksViewItemKey", () => {
	it("keys meetings by file path", () => {
		const m = meeting({date: "2026-06-29"});
		expect(tasksViewItemKey({kind: "meeting", meeting: m, dateIso: "2026-06-29", startMinutes: null})).toBe(
			"meeting:m.md",
		);
	});
});

describe("filterOpenTasksForTasksView", () => {
	const baseSettings = {
		taskSidebarFilterUncheckedStatus: [],
		taskSidebarFilterUncheckedProject: [],
		taskSidebarFilterUncheckedSource: [],
	} as unknown as FulcrumSettings;

	it("filters by unchecked task source", () => {
		const tasks = [
			task({title: "Note"}),
			task({title: "Inline", source: "inline", line: 1}),
		];
		const onlyNotes = filterOpenTasksForTasksView(tasks, {
			...baseSettings,
			taskSidebarFilterUncheckedSource: ["inline"],
		});
		expect(onlyNotes).toHaveLength(1);
		expect(onlyNotes[0]?.source).toBe("taskNote");

		const onlyInline = filterOpenTasksForTasksView(tasks, {
			...baseSettings,
			taskSidebarFilterUncheckedSource: ["taskNote"],
		});
		expect(onlyInline).toHaveLength(1);
		expect(onlyInline[0]?.source).toBe("inline");
	});

	it("composes source filter with status filter", () => {
		const tasks = [
			task({title: "Note todo", status: "todo"}),
			task({title: "Note done", status: "done"}),
			task({title: "Inline", source: "inline", line: 1, status: "todo"}),
		];
		const filtered = filterOpenTasksForTasksView(tasks, {
			...baseSettings,
			taskSidebarFilterUncheckedStatus: ["done"],
			taskSidebarFilterUncheckedSource: ["inline"],
		});
		expect(filtered.map((t) => t.title)).toEqual(["Note todo"]);
	});
});

describe("unscheduledSectionDefaultExpanded", () => {
	const settings = {
		taskSidebarFilterUncheckedSource: [],
	} as unknown as FulcrumSettings;

	it("expands when unscheduled includes inline tasks", () => {
		expect(
			unscheduledSectionDefaultExpanded(
				[task({source: "inline", line: 2})],
				settings,
			),
		).toBe(true);
	});

	it("stays collapsed for task notes only", () => {
		expect(unscheduledSectionDefaultExpanded([task({})], settings)).toBe(false);
	});

	it("stays collapsed when inline is filtered out", () => {
		expect(
			unscheduledSectionDefaultExpanded(
				[task({source: "inline", line: 2})],
				{...settings, taskSidebarFilterUncheckedSource: ["inline"]},
			),
		).toBe(false);
	});
});

describe("indexedTaskFromPlannerEvent", () => {
	it("maps start minutes to scheduled datetime", () => {
		const file = {path: "d.md", basename: "d.md", stat: {ctime: 0}} as IndexedTask["file"];
		const ev: IndexedPlannerEvent = {
			file,
			line: 1,
			dateIso: "2026-08-10",
			title: "Block",
			status: "todo",
			startMinutes: 14 * 60 + 30,
			durationMinutes: 30,
			projectFile: null,
			trackedMinutes: 0,
		};
		const t = indexedTaskFromPlannerEvent(ev);
		expect(t.source).toBe("inline");
		expect(t.scheduledDate).toBe("2026-08-10T14:30");
	});
});
