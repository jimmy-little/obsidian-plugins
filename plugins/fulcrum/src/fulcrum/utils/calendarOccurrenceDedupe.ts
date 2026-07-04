import type {AtomicNoteRow, IndexedMeeting} from "../types";
import type {ForecastCalendarRow} from "../tasks/tasksViewModel";
import type {CalendarEvent} from "./calendarEvents";
import {parseDateTime} from "./dateTimeParse";

function atomicNoteDisplayTitle(n: AtomicNoteRow): string {
	return n.entryTitle?.trim() || n.file.basename.replace(/\.md$/i, "");
}

export function normalizeOccurrenceTitle(title: string): string {
	return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function occurrenceDedupeKey(
	dateIso: string,
	startMinutes: number | null,
	title: string,
): string {
	const timePart = startMinutes == null ? "all" : String(startMinutes);
	return `${dateIso}|${timePart}|${normalizeOccurrenceTitle(title)}`;
}

export function meetingDisplayTitle(m: IndexedMeeting): string {
	return m.title?.trim() || m.file.basename.replace(/\.md$/i, "");
}

export function buildMeetingOccurrenceKeySet(meetings: IndexedMeeting[]): Set<string> {
	const keys = new Set<string>();
	for (const m of meetings) {
		const parsed = parseDateTime(m.date);
		if (!parsed?.dateIso) continue;
		keys.add(
			occurrenceDedupeKey(
				parsed.dateIso,
				parsed.minutesFromMidnight ?? null,
				meetingDisplayTitle(m),
			),
		);
	}
	return keys;
}

export function filterForecastCalendarsAgainstMeetings(
	rows: ForecastCalendarRow[],
	meetings: IndexedMeeting[],
): ForecastCalendarRow[] {
	if (meetings.length === 0 || rows.length === 0) return rows;
	const keys = buildMeetingOccurrenceKeySet(meetings);
	return rows.filter(
		(row) =>
			!keys.has(occurrenceDedupeKey(row.dateIso, row.startMinutes, row.title)),
	);
}

export function filterExternalCalendarEventsAgainstMeetings(
	events: CalendarEvent[],
	meetings: IndexedMeeting[],
): CalendarEvent[] {
	if (meetings.length === 0 || events.length === 0) return events;
	const keys = buildMeetingOccurrenceKeySet(meetings);
	return events.filter((e) => {
		if (e.kind !== "external") return true;
		return !keys.has(occurrenceDedupeKey(e.dateIso, e.startMinutes, e.title));
	});
}

export function atomicNoteMatchesMeeting(n: AtomicNoteRow, m: IndexedMeeting): boolean {
	if (n.file.path === m.file.path) return true;

	const noteParsed = parseDateTime(n.startTime?.trim() || n.dateSort?.trim());
	const meetingParsed = parseDateTime(m.date);
	if (!noteParsed || !meetingParsed) return false;

	return (
		occurrenceDedupeKey(
			noteParsed.dateIso,
			noteParsed.minutesFromMidnight ?? null,
			atomicNoteDisplayTitle(n),
		) ===
		occurrenceDedupeKey(
			meetingParsed.dateIso,
			meetingParsed.minutesFromMidnight ?? null,
			meetingDisplayTitle(m),
		)
	);
}

/** Drop project-linked notes that duplicate an indexed meeting (same file or same occurrence). */
export function filterAtomicNotesAgainstMeetings(
	notes: AtomicNoteRow[],
	meetings: IndexedMeeting[],
): AtomicNoteRow[] {
	if (notes.length === 0 || meetings.length === 0) return notes;
	return notes.filter((n) => !meetings.some((m) => atomicNoteMatchesMeeting(n, m)));
}
