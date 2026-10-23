import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	normalizePath: (p: string) => p,
	TFolder: class TFolder {},
	TFile: class TFile {},
}));
import type {AtomicNoteRow, IndexedMeeting, IndexedPlannerEvent} from "../../types";
import {buildTodayFeed, todayFeedTimeLabel} from "../todayFeed";

function meeting(partial: Partial<IndexedMeeting> & {date: string; title: string}): IndexedMeeting {
	return {
		file: {path: `${partial.title}.md`, basename: `${partial.title}.md`} as IndexedMeeting["file"],
		projectFile: null,
		...partial,
	};
}

function note(partial: Partial<AtomicNoteRow> & {dateSort: string; entryTitle: string}): AtomicNoteRow {
	return {
		file: {path: `${partial.entryTitle}.md`, basename: `${partial.entryTitle}.md`} as AtomicNoteRow["file"],
		dateDisplay: partial.dateSort,
		trackedMinutes: 0,
		tags: [],
		modifiedMs: 0,
		...partial,
	};
}

function planner(partial: Partial<IndexedPlannerEvent> & {dateIso: string; title: string}): IndexedPlannerEvent {
	return {
		file: {path: "daily.md", basename: "daily.md"} as IndexedPlannerEvent["file"],
		line: 3,
		status: " ",
		startMinutes: 10 * 60,
		durationMinutes: 30,
		projectFile: null,
		trackedMinutes: 0,
		...partial,
	};
}

describe("buildTodayFeed", () => {
	const dateIso = "2026-09-04";

	it("splits all-day, morning, and afternoon", () => {
		const sections = buildTodayFeed({
			dateIso,
			meetings: [
				meeting({date: "2026-09-04", title: "All-hands"}),
				meeting({date: "2026-09-04T09:30:00", title: "Standup"}),
				meeting({date: "2026-09-04T15:00:00", title: "Wrap"}),
			],
			notes: [note({dateSort: "2026-09-04T08:00:00", entryTitle: "Journal"})],
			calendarEvents: [
				{
					eventId: "e1",
					title: "Sprint",
					dateIso,
					startMinutes: null,
					durationMinutes: null,
					calendarTitle: "Work",
				},
			],
			plannerEvents: [planner({dateIso, title: "Deep work", startMinutes: 14 * 60})],
			dailyNoteTitle: "2026-09-04",
		});
		expect(sections.map((s) => s.key)).toEqual(["allDay", "morning", "afternoon"]);
		expect(sections[0]?.items.map((i) => i.kind).sort()).toEqual(["calendar", "daily", "meeting"]);
		expect(sections[1]?.items.map((i) => i.title)).toEqual(["Journal", "Standup"]);
		expect(sections[2]?.items.map((i) => i.title)).toEqual(["Deep work", "Wrap"]);
	});

	it("ignores items on other days", () => {
		const sections = buildTodayFeed({
			dateIso,
			meetings: [meeting({date: "2026-09-05T09:00:00", title: "Tomorrow"})],
			notes: [note({dateSort: "2026-09-03", entryTitle: "Yesterday"})],
			calendarEvents: [{eventId: "x", title: "X", dateIso: "2026-09-06", startMinutes: 0, durationMinutes: 30}],
			plannerEvents: [planner({dateIso: "2026-09-01", title: "Old"})],
		});
		expect(sections).toEqual([]);
	});

	it("places due-today tasks in the agenda; timed tasks go on the timeline", () => {
		const sections = buildTodayFeed({
			dateIso,
			meetings: [],
			notes: [],
			calendarEvents: [],
			plannerEvents: [],
			dayTasks: [
				{
					task: {
						file: {path: "untimed.md", basename: "untimed.md"},
						title: "Inbox",
						status: "todo",
						projectFile: null,
						areaFile: null,
						tags: [],
						createdAtMs: 0,
						source: "taskNote",
						trackedMinutes: 0,
						dueDate: dateIso,
					} as never,
				},
				{
					task: {
						file: {path: "timed.md", basename: "timed.md"},
						title: "Call",
						status: "todo",
						projectFile: null,
						areaFile: null,
						tags: [],
						createdAtMs: 0,
						source: "taskNote",
						trackedMinutes: 0,
						dueDate: `${dateIso}T15:30:00`,
					} as never,
				},
			],
		});
		expect(sections.map((s) => s.key)).toEqual(["allDay", "afternoon"]);
		expect(sections[0]?.items.map((i) => i.title)).toEqual(["Inbox"]);
		expect(sections[1]?.items[0]).toMatchObject({
			kind: "task",
			title: "Call",
			startMinutes: 15 * 60 + 30,
		});
	});

	it("puts project under notes and strips wiki brackets from type", () => {
		const sections = buildTodayFeed({
			dateIso,
			meetings: [
				meeting({
					date: "2026-09-04T09:00:00",
					title: "Standup",
					projectFile: {path: "proj.md", basename: "Core Library Admin.md"} as IndexedMeeting["file"],
				}),
			],
			notes: [
				note({
					dateSort: "2026-09-04T10:00:00",
					entryTitle: "Capture",
					noteType: "[[Meeting]]",
					projectFile: {path: "proj.md", basename: "Core Library Admin.md"} as AtomicNoteRow["file"],
				}),
			],
			calendarEvents: [],
			plannerEvents: [],
		});
		const morning = sections.find((s) => s.key === "morning");
		expect(morning?.items.find((i) => i.kind === "meeting")?.subtitle).toBe("Core Library Admin");
		expect(morning?.items.find((i) => i.kind === "note")?.subtitle).toBe("Core Library Admin · Meeting");
	});

	it("keeps completed tasks, prefers tracked time, and shows calendar location", () => {
		const sections = buildTodayFeed({
			dateIso,
			meetings: [],
			notes: [
				note({
					dateSort: "2026-09-04T08:00:00",
					entryTitle: "Capture",
					trackedMinutes: 45,
				}),
			],
			calendarEvents: [
				{
					eventId: "pickup",
					title: "Gary Pick Up",
					dateIso,
					startMinutes: 16 * 60 + 55,
					durationMinutes: 20,
					calendarTitle: "Family",
					location: "THOMAS EDISON ELEMENTARY, 2110 W CHESTNUT ST",
					calendarColor: "#3366cc",
				},
			],
			plannerEvents: [],
			doneStatuses: new Set(["done"]),
			dayTasks: [
				{
					task: {
						file: {path: "done.md", basename: "done.md"},
						title: "Write follow-ups",
						status: "done",
						projectFile: {path: "proj.md", basename: "Taxonomy Syndication Service.md"},
						areaFile: null,
						tags: ["#hide-me"],
						createdAtMs: 0,
						source: "taskNote",
						trackedMinutes: 25,
						durationMinutes: 30,
						dueDate: `${dateIso}T09:00:00`,
					} as never,
				},
				{
					task: {
						file: {path: "recur.md", basename: "recur.md"},
						title: "Standup prep",
						status: "todo",
						projectFile: null,
						areaFile: null,
						tags: [],
						createdAtMs: 0,
						source: "taskNote",
						trackedMinutes: 0,
						completeInstances: [dateIso],
						dueDate: dateIso,
					} as never,
					occurrenceDateIso: dateIso,
				},
			],
		});
		const morning = sections.find((s) => s.key === "morning");
		const doneTask = morning?.items.find((i) => i.title === "Write follow-ups");
		expect(doneTask).toMatchObject({
			done: true,
			trackedMinutes: 25,
			subtitle: "Taxonomy Syndication Service",
			projectPath: "proj.md",
		});
		expect(todayFeedTimeLabel(doneTask!)).toBe("25min");
		const allDay = sections.find((s) => s.key === "allDay");
		expect(allDay?.items.find((i) => i.title === "Standup prep")?.done).toBe(true);
		const capture = morning?.items.find((i) => i.title === "Capture");
		expect(capture?.trackedMinutes).toBe(45);
		expect(todayFeedTimeLabel(capture!)).toBe("45min");
		const afternoon = sections.find((s) => s.key === "afternoon");
		expect(afternoon?.items[0]).toMatchObject({
			kind: "calendar",
			subtitle: "THOMAS EDISON ELEMENTARY, 2110 W CHESTNUT ST",
			location: "THOMAS EDISON ELEMENTARY, 2110 W CHESTNUT ST",
			calendarColor: "#3366cc",
			explicitDurationMinutes: 20,
		});
		expect(todayFeedTimeLabel(afternoon!.items[0]!)).toBe("20min");
	});
});
