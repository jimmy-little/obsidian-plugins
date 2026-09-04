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

export function occurrenceKeyFromNote(n: AtomicNoteRow): string | null {
	const parsed = parseDateTime(n.startTime?.trim() || n.dateSort?.trim());
	if (!parsed?.dateIso) return null;
	return occurrenceDedupeKey(
		parsed.dateIso,
		parsed.minutesFromMidnight ?? null,
		atomicNoteDisplayTitle(n),
	);
}

export function occurrenceKeyFromMeeting(m: IndexedMeeting): string | null {
	const parsed = parseDateTime(m.date);
	if (!parsed?.dateIso) return null;
	return occurrenceDedupeKey(
		parsed.dateIso,
		parsed.minutesFromMidnight ?? null,
		meetingDisplayTitle(m),
	);
}

export function buildMeetingOccurrenceKeySet(meetings: IndexedMeeting[]): Set<string> {
	const keys = new Set<string>();
	for (const m of meetings) {
		const key = occurrenceKeyFromMeeting(m);
		if (key) keys.add(key);
	}
	return keys;
}

export function buildNoteOccurrenceKeySet(notes: AtomicNoteRow[]): Set<string> {
	const keys = new Set<string>();
	for (const n of notes) {
		const key = occurrenceKeyFromNote(n);
		if (key) keys.add(key);
	}
	return keys;
}

function noteFilePaths(notes: AtomicNoteRow[]): Set<string> {
	return new Set(notes.map((n) => n.file.path));
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

export function filterForecastCalendarsAgainstNotes(
	rows: ForecastCalendarRow[],
	notes: AtomicNoteRow[],
): ForecastCalendarRow[] {
	if (notes.length === 0 || rows.length === 0) return rows;
	const keys = buildNoteOccurrenceKeySet(notes);
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

export function filterExternalCalendarEventsAgainstNotes(
	events: CalendarEvent[],
	notes: AtomicNoteRow[],
): CalendarEvent[] {
	if (notes.length === 0 || events.length === 0) return events;
	const keys = buildNoteOccurrenceKeySet(notes);
	return events.filter((e) => {
		if (e.kind !== "external") return true;
		return !keys.has(occurrenceDedupeKey(e.dateIso, e.startMinutes, e.title));
	});
}

/** Drop indexed meetings that duplicate a vault note (same file or same occurrence). */
export function filterMeetingsAgainstNotes(
	meetings: IndexedMeeting[],
	notes: AtomicNoteRow[],
): IndexedMeeting[] {
	if (meetings.length === 0 || notes.length === 0) return meetings;
	const paths = noteFilePaths(notes);
	const keys = buildNoteOccurrenceKeySet(notes);
	return meetings.filter((m) => {
		if (paths.has(m.file.path)) return false;
		const key = occurrenceKeyFromMeeting(m);
		return !key || !keys.has(key);
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

/**
 * When a vault note matches a calendar event or meeting (same date, start, title),
 * keep the note — it is the actionable item — and drop the calendar/meeting copy.
 * External events that match a remaining meeting are also dropped.
 */
export function preferNotesInCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
	if (events.length === 0) return events;
	const noteKeys = new Set<string>();
	const notePaths = new Set<string>();
	const meetingKeys = new Set<string>();
	for (const e of events) {
		const key = occurrenceDedupeKey(e.dateIso, e.startMinutes, e.title);
		if (e.kind === "note") {
			noteKeys.add(key);
			if (e.note?.file.path) notePaths.add(e.note.file.path);
		} else if (e.kind === "meeting") {
			meetingKeys.add(key);
		}
	}
	return events.filter((e) => {
		const key = occurrenceDedupeKey(e.dateIso, e.startMinutes, e.title);
		if (e.kind === "meeting") {
			if (e.meeting && notePaths.has(e.meeting.file.path)) return false;
			return !noteKeys.has(key);
		}
		if (e.kind === "external") {
			return !noteKeys.has(key) && !meetingKeys.has(key);
		}
		return true;
	});
}
