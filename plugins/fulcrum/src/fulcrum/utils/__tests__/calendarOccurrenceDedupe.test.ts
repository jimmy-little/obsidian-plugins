import {describe, expect, it} from "vitest";
import type {AtomicNoteRow, IndexedMeeting} from "../../types";
import type {ForecastCalendarRow} from "../../tasks/tasksViewModel";
import {
	atomicNoteMatchesMeeting,
	filterAtomicNotesAgainstMeetings,
	filterForecastCalendarsAgainstMeetings,
	filterMeetingsAgainstNotes,
	filterExternalCalendarEventsAgainstNotes,
	normalizeOccurrenceTitle,
	occurrenceDedupeKey,
	preferNotesInCalendarEvents,
} from "../calendarOccurrenceDedupe";
import type {CalendarEvent} from "../calendarEvents";

function meeting(partial: Partial<IndexedMeeting> & {date?: string; title?: string}): IndexedMeeting {
	return {
		file: {path: "m.md", basename: "m.md"} as IndexedMeeting["file"],
		projectFile: null,
		...partial,
	};
}

function atomicNote(
	partial: Partial<AtomicNoteRow> & {file?: AtomicNoteRow["file"]},
): AtomicNoteRow {
	return {
		file: {path: "n.md", basename: "n.md"} as AtomicNoteRow["file"],
		dateSort: "2026-06-30",
		dateDisplay: "Jun 30",
		trackedMinutes: 0,
		entryTitle: "Note",
		tags: [],
		modifiedMs: 0,
		...partial,
	};
}

describe("occurrenceDedupeKey", () => {
	it("normalizes title case and whitespace", () => {
		expect(normalizeOccurrenceTitle("  Team   Sync  ")).toBe("team sync");
		expect(occurrenceDedupeKey("2026-06-30", 540, "Team Sync")).toBe(
			occurrenceDedupeKey("2026-06-30", 540, "team sync"),
		);
	});
});

describe("filterForecastCalendarsAgainstMeetings", () => {
	it("drops calendar rows matching meeting start time and title", () => {
		const rows: ForecastCalendarRow[] = [
			{
				eventId: "1",
				title: "Standup",
				dateIso: "2026-06-30",
				startMinutes: 9 * 60,
				durationMinutes: 30,
			},
			{
				eventId: "2",
				title: "Other",
				dateIso: "2026-06-30",
				startMinutes: 14 * 60,
				durationMinutes: 30,
			},
		];
		const filtered = filterForecastCalendarsAgainstMeetings(rows, [
			meeting({title: "Standup", date: "2026-06-30T09:00"}),
		]);
		expect(filtered.map((r) => r.title)).toEqual(["Other"]);
	});

	it("matches all-day meeting and event when both lack a time", () => {
		const rows: ForecastCalendarRow[] = [
			{
				eventId: "1",
				title: "Offsite",
				dateIso: "2026-06-30",
				startMinutes: null,
				durationMinutes: null,
			},
		];
		const filtered = filterForecastCalendarsAgainstMeetings(rows, [
			meeting({title: "Offsite", date: "2026-06-30"}),
		]);
		expect(filtered).toHaveLength(0);
	});

	it("keeps calendar row when title differs", () => {
		const rows: ForecastCalendarRow[] = [
			{
				eventId: "1",
				title: "Standup",
				dateIso: "2026-06-30",
				startMinutes: 9 * 60,
				durationMinutes: 30,
			},
		];
		const filtered = filterForecastCalendarsAgainstMeetings(rows, [
			meeting({title: "Different", date: "2026-06-30T09:00"}),
		]);
		expect(filtered).toHaveLength(1);
	});
});

describe("atomicNoteMatchesMeeting", () => {
	it("matches the same vault file", () => {
		const file = {path: "meetings/standup.md", basename: "standup.md"} as AtomicNoteRow["file"];
		expect(
			atomicNoteMatchesMeeting(
				atomicNote({file, entryTitle: "Standup", dateSort: "2026-06-30"}),
				meeting({file, title: "Standup", date: "2026-06-30T09:00"}),
			),
		).toBe(true);
	});

	it("matches same title and start time on different paths", () => {
		expect(
			atomicNoteMatchesMeeting(
				atomicNote({
					entryTitle: "Standup",
					startTime: "2026-06-30T09:00",
					dateSort: "2026-06-30",
				}),
				meeting({title: "Standup", date: "2026-06-30T09:00"}),
			),
		).toBe(true);
	});

	it("does not match when only the date matches", () => {
		expect(
			atomicNoteMatchesMeeting(
				atomicNote({entryTitle: "Standup", dateSort: "2026-06-30"}),
				meeting({title: "Standup", date: "2026-06-30T09:00"}),
			),
		).toBe(false);
	});
});

describe("filterAtomicNotesAgainstMeetings", () => {
	it("removes notes that duplicate a meeting occurrence", () => {
		const file = {path: "meetings/standup.md", basename: "standup.md"} as AtomicNoteRow["file"];
		const notes = [
			atomicNote({file, entryTitle: "Standup", dateSort: "2026-06-30"}),
			atomicNote({entryTitle: "Other note", dateSort: "2026-06-30"}),
		];
		const filtered = filterAtomicNotesAgainstMeetings(notes, [
			meeting({file, title: "Standup", date: "2026-06-30T09:00"}),
		]);
		expect(filtered.map((n) => n.entryTitle)).toEqual(["Other note"]);
	});
});

describe("filterMeetingsAgainstNotes", () => {
	it("drops meetings that match a note by file path", () => {
		const file = {path: "meetings/standup.md", basename: "standup.md"} as AtomicNoteRow["file"];
		const filtered = filterMeetingsAgainstNotes(
			[
				meeting({file, title: "Standup", date: "2026-06-30T09:00"}),
				meeting({title: "Other", date: "2026-06-30T10:00"}),
			],
			[atomicNote({file, entryTitle: "Standup", dateSort: "2026-06-30"})],
		);
		expect(filtered.map((m) => m.title)).toEqual(["Other"]);
	});

	it("drops meetings that match a note by title and start time", () => {
		const filtered = filterMeetingsAgainstNotes(
			[meeting({title: "Core Library Standup", date: "2026-09-04T09:00"})],
			[
				atomicNote({
					entryTitle: "Core Library Standup",
					startTime: "2026-09-04T09:00",
					dateSort: "2026-09-04",
				}),
			],
		);
		expect(filtered).toHaveLength(0);
	});
});

describe("preferNotesInCalendarEvents", () => {
	function event(
		partial: Pick<CalendarEvent, "kind" | "title" | "dateIso" | "startMinutes"> &
			Partial<CalendarEvent>,
	): CalendarEvent {
		return {
			durationMinutes: 30,
			accentCss: null,
			open: () => {},
			...partial,
		};
	}

	it("keeps the note and drops a matching meeting and calendar event", () => {
		const noteFile = {path: "notes/sync.md", basename: "sync.md"} as AtomicNoteRow["file"];
		const filtered = preferNotesInCalendarEvents([
			event({
				kind: "meeting",
				title: "Disney - Fluree BiWeekly Sync",
				dateIso: "2026-09-04",
				startMinutes: 8 * 60 + 35,
			}),
			event({
				kind: "note",
				title: "Disney - Fluree BiWeekly Sync",
				dateIso: "2026-09-04",
				startMinutes: 8 * 60 + 35,
				note: atomicNote({file: noteFile, entryTitle: "Disney - Fluree BiWeekly Sync"}),
			}),
			event({
				kind: "external",
				title: "Disney - Fluree BiWeekly Sync",
				dateIso: "2026-09-04",
				startMinutes: 8 * 60 + 35,
			}),
			event({
				kind: "external",
				title: "Gary Drop Off (C)",
				dateIso: "2026-09-04",
				startMinutes: 7 * 60 + 55,
			}),
		]);
		expect(filtered.map((e) => `${e.kind}:${e.title}`)).toEqual([
			"note:Disney - Fluree BiWeekly Sync",
			"external:Gary Drop Off (C)",
		]);
	});
});

describe("filterExternalCalendarEventsAgainstNotes", () => {
	it("drops external events that match a note occurrence", () => {
		const filtered = filterExternalCalendarEventsAgainstNotes(
			[
				{
					kind: "external",
					title: "Standup",
					dateIso: "2026-06-30",
					startMinutes: 9 * 60,
					durationMinutes: 30,
					accentCss: null,
					open: () => {},
				},
				{
					kind: "external",
					title: "Other",
					dateIso: "2026-06-30",
					startMinutes: 10 * 60,
					durationMinutes: 30,
					accentCss: null,
					open: () => {},
				},
			],
			[
				atomicNote({
					entryTitle: "Standup",
					startTime: "2026-06-30T09:00",
					dateSort: "2026-06-30",
				}),
			],
		);
		expect(filtered.map((e) => e.title)).toEqual(["Other"]);
	});
});
