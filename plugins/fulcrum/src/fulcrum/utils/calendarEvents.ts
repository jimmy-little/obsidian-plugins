/**
 * Calendar event parsing for Fulcrum calendar view.
 * Parses start/end times from date strings; all-day vs timed placement.
 */

import type {TFile} from "obsidian";
import type {PlannedBlock} from "../../timer/types";
import type {
	AtomicNoteRow,
	IndexedMeeting,
	IndexedPlannerEvent,
	IndexedProject,
	IndexedTask,
} from "../types";
import {meetingEffectiveMinutes} from "./meetingEffectiveMinutes";
import {parseDateTime, localDateIsoFromDate as localDateIso} from "./dateTimeParse";
import {resolveProjectAccentCss} from "./projectVisual";
import {occurrenceScheduledIso} from "../tasks/horizonRecurringOccurrences";
import {taskDisplayTitle} from "./inlineTasks";

export {parseDateTime} from "./dateTimeParse";

export type CalendarEventKind = "task" | "meeting" | "logged" | "planned" | "planner" | "note" | "external";

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
	/** Daily-note planner line */
	planner?: IndexedPlannerEvent;
	/** Timer overlay: entry id for stable keys and live updates */
	timerEntryId?: string;
	/** Timer overlay: tracking note path */
	timerNotePath?: string;
	/** Timer overlay: start timestamp (ms) for growing active blocks */
	timerStartMs?: number;
	/** Timer still running (no end time yet) */
	isActiveTimer?: boolean;
	/** Planned block from timer day note */
	planned?: {file: TFile; block: PlannedBlock; dateIso: string};
	/** Recurring task: projected future occurrence (read-only preview). */
	isGhostOccurrence?: boolean;
	occurrenceDateIso?: string;
};

const DEFAULT_DURATION_MINUTES = 30;
const MIN_SPAN_MINUTES = 15;

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

/**
 * Calendar event for a task's due date only (dashboard week grid).
 * Untimed due → all-day (`startMinutes: null`); timed due → timed chip.
 */
export function taskDueDateToCalendarEvent(
	t: IndexedTask,
	open: () => void,
	projectColorByPath: Map<string, string>,
): CalendarEvent | null {
	const due = parseDateTime(t.dueDate);
	if (!due) return null;
	const isAllDay = due.minutesFromMidnight == null;
	const accentCss = t.projectFile?.path
		? resolveProjectAccentCss(projectColorByPath.get(t.projectFile.path) ?? undefined)
		: null;
	return {
		kind: "task",
		dateIso: due.dateIso,
		startMinutes: due.minutesFromMidnight,
		durationMinutes: isAllDay ? null : timedDurationForTask(t),
		title: taskDisplayTitle(t),
		accentCss,
		open,
		task: t,
	};
}

/** Stable key for Svelte `{#each}` / DnD identity. */
export function calendarEventKey(e: CalendarEvent): string {
	if (e.task) {
		const occ = e.occurrenceDateIso ?? e.dateIso;
		return `task:${e.task.file.path}:${e.task.line ?? ""}:${occ}:${e.isGhostOccurrence ? "ghost" : "live"}`;
	}
	if (e.meeting) return `meeting:${e.meeting.file.path}:${e.dateIso}`;
	if (e.planner) return `planner:${e.planner.file.path}:${e.planner.line}`;
	if (e.timerEntryId) return `timer:${e.timerEntryId}:${e.dateIso}`;
	return `${e.kind}:${e.title}:${e.dateIso}:${e.startMinutes ?? "a"}`;
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
			title: taskDisplayTitle(t),
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
			title: taskDisplayTitle(t),
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
			title: taskDisplayTitle(t),
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
			title: taskDisplayTitle(t),
			accentCss,
			open,
			task: t,
		});
	}

	if (sched) addParsedDueOrSched(sched);
	if (due && due.dateIso !== sched?.dateIso) addParsedDueOrSched(due);
	return events;
}

/** Calendar events for one projected occurrence of a recurring task. */
export function taskOccurrenceToCalendarEvents(
	t: IndexedTask,
	occurrenceDateIso: string,
	isGhost: boolean,
	open: () => void,
	projectColorByPath: Map<string, string>,
): CalendarEvent[] {
	const scheduledForOcc = occurrenceScheduledIso(t, occurrenceDateIso);
	const viewTask: IndexedTask = {
		...t,
		scheduledDate: scheduledForOcc,
		dueDate: occurrenceDateIso,
		startTime: undefined,
		endTime: undefined,
	};
	const events = taskToCalendarEvent(viewTask, open, projectColorByPath);
	for (const e of events) {
		e.isGhostOccurrence = isGhost;
		e.occurrenceDateIso = occurrenceDateIso;
	}
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

/** Build calendar event from a daily-note planner checkbox line. */
export function plannerEventToCalendarEvent(
	p: IndexedPlannerEvent,
	open: () => void,
	defaultDurationMinutes: number,
	projectColorByPath: Map<string, string> = new Map(),
): CalendarEvent {
	const isAllDay = p.startMinutes == null;
	const duration = isAllDay
		? null
		: Math.max(1, p.durationMinutes ?? defaultDurationMinutes);
	const accentCss = p.projectFile?.path
		? resolveProjectAccentCss(projectColorByPath.get(p.projectFile.path) ?? undefined)
		: null;

	return {
		kind: "planner",
		dateIso: p.dateIso,
		startMinutes: p.startMinutes,
		durationMinutes: duration,
		title: p.title,
		accentCss,
		open,
		planner: p,
	};
}

/** Build calendar event from a project-linked atomic note (timed when start/end present). */
export function atomicNoteToCalendarEvent(
	n: AtomicNoteRow,
	open: () => void,
	accentCss: string | null,
): CalendarEvent | null {
	const title = n.entryTitle?.trim() || n.file.basename;
	const timeRaw = n.startTime?.trim() || n.dateSort?.trim();
	if (!timeRaw) return null;

	const actual = parseActualTimeBlock(n.startTime?.trim() || timeRaw, n.endTime);
	if (actual) {
		return {
			kind: "note",
			dateIso: actual.dateIso,
			startMinutes: actual.startMinutes,
			durationMinutes: actual.durationMinutes,
			title,
			accentCss,
			open,
		};
	}

	const parsed = parseDateTime(timeRaw);
	if (!parsed) return null;
	const isAllDay = parsed.minutesFromMidnight == null;
	return {
		kind: "note",
		dateIso: parsed.dateIso,
		startMinutes: parsed.minutesFromMidnight,
		durationMinutes: isAllDay ? null : DEFAULT_DURATION_MINUTES,
		title,
		accentCss,
		open,
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
