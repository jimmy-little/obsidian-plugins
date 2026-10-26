import {describe, expect, it, vi} from "vitest";

vi.mock("obsidian", () => ({
	normalizePath: (p: string) => p,
	TFolder: class TFolder {},
	TFile: class TFile {},
}));
import type {AtomicNoteRow, IndexedMeeting, IndexedPlannerEvent} from "../../types";
import type {JiraActivityItem} from "../../jira/jiraTypes";
import {buildTodayFeed, jiraActivityFeedItem, todayFeedTimeLabel} from "../todayFeed";

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

	it("places Jira rows by local time on the matching day and excludes other days", () => {
		const ticket: JiraActivityItem = {
			key: "jira-ticket:TAXONOMY-1",
			kind: "ticket",
			issueKey: "TAXONOMY-1",
			issueTitle: "Fix the sync job",
			timestampIso: `${dateIso}T09:15:00`,
			url: "https://deept.atlassian.net/browse/TAXONOMY-1",
		};
		const comment: JiraActivityItem = {
			key: "jira-comment:TAXONOMY-2:c1",
			kind: "comment",
			issueKey: "TAXONOMY-2",
			issueTitle: "Core Library cleanup",
			timestampIso: `${dateIso}T16:30:00`,
			url: "https://deept.atlassian.net/browse/TAXONOMY-2?focusedCommentId=c1",
			commentExcerpt: "Can you take a look at this?",
		};
		const otherDay: JiraActivityItem = {
			key: "jira-ticket:TAXONOMY-3",
			kind: "ticket",
			issueKey: "TAXONOMY-3",
			issueTitle: "Not today",
			timestampIso: "2026-09-05T09:00:00",
			url: "https://deept.atlassian.net/browse/TAXONOMY-3",
		};

		const sections = buildTodayFeed({
			dateIso,
			meetings: [],
			notes: [],
			calendarEvents: [],
			plannerEvents: [],
			jiraItems: [ticket, comment, otherDay],
		});

		expect(sections.map((s) => s.key)).toEqual(["morning", "afternoon"]);
		const morning = sections.find((s) => s.key === "morning")!;
		const afternoon = sections.find((s) => s.key === "afternoon")!;
		expect(morning.items).toHaveLength(1);
		expect(morning.items[0]).toMatchObject({
			kind: "jiraTicket",
			title: "TAXONOMY-1 | Fix the sync job",
			startMinutes: 9 * 60 + 15,
			externalUrl: "https://deept.atlassian.net/browse/TAXONOMY-1",
			issueKey: "TAXONOMY-1",
		});
		expect(afternoon.items).toHaveLength(1);
		expect(afternoon.items[0]).toMatchObject({
			kind: "jiraComment",
			title: "TAXONOMY-2 | Core Library cleanup",
			subtitle: '"Can you take a look at this?"',
			subtitleMultiline: true,
			externalUrl: "https://deept.atlassian.net/browse/TAXONOMY-2?focusedCommentId=c1",
			issueKey: "TAXONOMY-2",
		});
		expect(sections.flatMap((s) => s.items).some((i) => i.title.includes("Not today"))).toBe(false);
	});
});

describe("jiraActivityFeedItem", () => {
	it("formats a ticket row with no subtitle", () => {
		const item = jiraActivityFeedItem({
			key: "jira-ticket:TAXONOMY-9",
			kind: "ticket",
			issueKey: "TAXONOMY-9",
			issueTitle: "Ship the thing",
			timestampIso: "2026-09-04T11:00:00",
			url: "https://deept.atlassian.net/browse/TAXONOMY-9",
		});
		expect(item).toMatchObject({
			kind: "jiraTicket",
			title: "TAXONOMY-9 | Ship the thing",
			subtitle: undefined,
			subtitleMultiline: false,
			externalUrl: "https://deept.atlassian.net/browse/TAXONOMY-9",
			issueKey: "TAXONOMY-9",
		});
	});

	it("quotes the comment excerpt and flags it as multiline", () => {
		const item = jiraActivityFeedItem({
			key: "jira-comment:TAXONOMY-9:c1",
			kind: "comment",
			issueKey: "TAXONOMY-9",
			issueTitle: "Ship the thing",
			timestampIso: "2026-09-04T11:00:00",
			url: "https://deept.atlassian.net/browse/TAXONOMY-9?focusedCommentId=c1",
			commentExcerpt: "Here's the comment",
		});
		expect(item.subtitle).toBe('"Here\'s the comment"');
		expect(item.subtitleMultiline).toBe(true);
	});
});
