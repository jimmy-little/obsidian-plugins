/**
 * Calendar event parsing for Fulcrum calendar view.
 * Parses start/end times from date strings; all-day vs timed placement.
 */

import type {IndexedMeeting, IndexedProject, IndexedTask} from "../types";
import {meetingEffectiveMinutes} from "./meetingEffectiveMinutes";
import {resolveProjectAccentCss} from "./projectVisual";

export type CalendarEventKind = "task" | "meeting";

export type CalendarEvent = {
	kind: CalendarEventKind;
	/** YYYY-MM-DD */
	dateIso: string;
	/** 0–1439 = minutes from midnight (00:00); null = all-day */
	startMinutes: number | null;
	/** Duration in minutes; null for all-day or single point */
	durationMinutes: number | null;
	/** For tasks: primary date used (scheduled or due) */
	title: string;
	/** Project color CSS when linked to project */
	accentCss: string | null;
	/** Open handler */
	open: () => void;
	/** For tasks */
	task?: IndexedTask;
	/** For meetings */
	meeting?: IndexedMeeting;
};

const DEFAULT_DURATION_MINUTES = 30;
const MIN_SPAN_MINUTES = 15;

function localDateIso(d: Date): string {
	const y = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${mo}-${day}`;
}

/**
 * After a YYYY-MM-DD prefix, parse HH:mm (optional :ss). Accepts `T`, `t`, or whitespace
 * between date and time (e.g. `2026-03-30 09:30`).
 */
function parseMinutesAfterIsoDate(rest: string): number | null {
	const tail = rest.trimStart();
	// Optional T/t, optional space after T; or one-or-more spaces before time; then H:mm
	const m = tail.match(/^(?:[Tt]\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
	if (!m) return null;
	const h = parseInt(m[1]!, 10);
	const min = parseInt(m[2]!, 10);
	if (h >= 0 && h < 24 && min >= 0 && min < 60) {
		return h * 60 + min;
	}
	return null;
}

/** Parse ISO-like string to { dateIso, minutesFromMidnight }.
 * Supports: YYYY-MM-DD, YYYY-MM-DDTHH:mm, YYYY-MM-DDt09:30, YYYY-MM-DD HH:mm, with optional :ss and offsets.
 * Other shapes fall back to Date.parse (locale forms).
 */
function parseDateTime(raw: string | undefined): {
	dateIso: string;
	minutesFromMidnight: number | null;
} | null {
	if (!raw?.trim()) return null;
	const s = String(raw).trim();
	const datePart = s.slice(0, 10);
	if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
		const rest = s.slice(10);
		const minutesFromMidnight =
			rest.length > 0 ? parseMinutesAfterIsoDate(rest) : null;
		return {dateIso: datePart, minutesFromMidnight};
	}

	const ms = Date.parse(s);
	if (Number.isNaN(ms)) return null;
	const d = new Date(ms);
	const dateIso = localDateIso(d);
	const minutesFromMidnight = d.getHours() * 60 + d.getMinutes();
	const hasTime =
		d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0 || d.getMilliseconds() !== 0;
	return {
		dateIso,
		minutesFromMidnight: hasTime ? minutesFromMidnight : null,
	};
}

/** Real work window: same local calendar day, end after start. */
function parseActualTimeBlock(
	startRaw: string | undefined,
	endRaw: string | undefined,
): {dateIso: string; startMinutes: number; durationMinutes: number} | null {
	if (!startRaw?.trim() || !endRaw?.trim()) return null;
	const a = Date.parse(startRaw.trim());
	const b = Date.parse(endRaw.trim());
	if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
	const ds = new Date(a);
	const de = new Date(b);
	const isoS = localDateIso(ds);
	if (isoS !== localDateIso(de)) return null;
	const startMinutes = ds.getHours() * 60 + ds.getMinutes();
	const durationMinutes = Math.max(MIN_SPAN_MINUTES, Math.round((b - a) / 60000));
	return {dateIso: isoS, startMinutes, durationMinutes};
}

function timedDurationForTask(t: IndexedTask): number {
	if (t.durationMinutes != null && Number.isFinite(t.durationMinutes) && t.durationMinutes > 0) {
		return Math.max(1, Math.round(t.durationMinutes));
	}
	return DEFAULT_DURATION_MINUTES;
}

function pushTaskEvent(
	events: CalendarEvent[],
	opts: {
		dateIso: string;
		startMinutes: number | null;
		durationMinutes: number | null;
		title: string;
		accentCss: string | null;
		open: () => void;
		task: IndexedTask;
	},
): void {
	events.push({
		kind: "task",
		dateIso: opts.dateIso,
		startMinutes: opts.startMinutes,
		durationMinutes: opts.durationMinutes,
		title: opts.title,
		accentCss: opts.accentCss,
		open: opts.open,
		task: opts.task,
	});
}

/**
 * Calendar placement priority:
 * 1. Actual startTime + endTime (same local day) → block at real start, height = end − start.
 * 2. Scheduled and due both have times on the same day → span from scheduled to due.
 * 3. Scheduled with a time → block at scheduled; height = duration (frontmatter) or default 30 min.
 * 4. Otherwise all-day from date-only scheduled/due (and a second day if due differs).
 */
export function taskToCalendarEvent(
	t: IndexedTask,
	open: () => void,
	projectColorByPath: Map<string, string>,
): CalendarEvent[] {
	const events: CalendarEvent[] = [];
	const accentCss = t.projectFile?.path
		? resolveProjectAccentCss(projectColorByPath.get(t.projectFile.path) ?? undefined)
		: null;

	const actual = parseActualTimeBlock(t.startTime, t.endTime);
	if (actual) {
		pushTaskEvent(events, {
			dateIso: actual.dateIso,
			startMinutes: actual.startMinutes,
			durationMinutes: actual.durationMinutes,
			title: t.title,
			accentCss,
			open,
			task: t,
		});
		return events;
	}

	const sched = parseDateTime(t.scheduledDate);
	const due = parseDateTime(t.dueDate);

	if (
		sched &&
		due &&
		sched.dateIso === due.dateIso &&
		sched.minutesFromMidnight != null &&
		due.minutesFromMidnight != null
	) {
		const startM = sched.minutesFromMidnight;
		const endM = due.minutesFromMidnight;
		const duration = Math.max(MIN_SPAN_MINUTES, endM - startM);
		pushTaskEvent(events, {
			dateIso: sched.dateIso,
			startMinutes: startM,
			durationMinutes: duration,
			title: t.title,
			accentCss,
			open,
			task: t,
		});
		return events;
	}

	if (sched?.minutesFromMidnight != null) {
		pushTaskEvent(events, {
			dateIso: sched.dateIso,
			startMinutes: sched.minutesFromMidnight,
			durationMinutes: timedDurationForTask(t),
			title: t.title,
			accentCss,
			open,
			task: t,
		});
		if (due && due.dateIso !== sched.dateIso) {
			addParsedDueOrSched(due);
		}
		return events;
	}

	function addParsedDueOrSched(parsed: NonNullable<ReturnType<typeof parseDateTime>>): void {
		const isAllDay = parsed.minutesFromMidnight == null;
		pushTaskEvent(events, {
			dateIso: parsed.dateIso,
			startMinutes: parsed.minutesFromMidnight,
			durationMinutes: isAllDay ? null : timedDurationForTask(t),
			title: t.title,
			accentCss,
			open,
			task: t,
		});
	}

	if (sched) addParsedDueOrSched(sched);
	if (due && due.dateIso !== sched?.dateIso) addParsedDueOrSched(due);
	return events;
}

/** Build calendar event from meeting.
 * date may include time. duration from meeting.duration. No time = all-day. Time but no duration = 30 min.
 */
export function meetingToCalendarEvent(
	m: IndexedMeeting,
	open: () => void,
	projectColorByPath: Map<string, string>,
): CalendarEvent | null {
	const parsed = parseDateTime(m.date);
	if (!parsed) return null;
	const isAllDay = parsed.minutesFromMidnight == null;
	const effective = meetingEffectiveMinutes(m);
	const duration =
		effective > 0 ? effective : isAllDay ? null : DEFAULT_DURATION_MINUTES;

	return {
		kind: "meeting",
		dateIso: parsed.dateIso,
		startMinutes: parsed.minutesFromMidnight,
		durationMinutes: duration,
		title: m.title?.trim() || "Meeting",
		accentCss: m.projectFile?.path
			? resolveProjectAccentCss(projectColorByPath.get(m.projectFile.path) ?? undefined)
			: null,
		open,
		meeting: m,
	};
}

/** Build project path -> color map from snapshot. */
export function projectColorMap(projects: IndexedProject[]): Map<string, string> {
	const m = new Map<string, string>();
	for (const p of projects) {
		if (p.color?.trim()) m.set(p.file.path, p.color);
	}
	return m;
}
