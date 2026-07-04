import {describe, expect, it} from "vitest";
import type {AtomicNoteRow, IndexedMeeting} from "../../types";
import type {ForecastCalendarRow} from "../../tasks/tasksViewModel";
import {
	atomicNoteMatchesMeeting,
	filterAtomicNotesAgainstMeetings,
	filterForecastCalendarsAgainstMeetings,
	normalizeOccurrenceTitle,
	occurrenceDedupeKey,
} from "../calendarOccurrenceDedupe";

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
