import {describe, expect, it} from "vitest";
import type {AtomicNoteRow, IndexedMeeting, IndexedPlannerEvent} from "../../types";
import {buildTodayFeed} from "../todayFeed";

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
});
