import type {AtomicNoteRow, IndexedMeeting, IndexedPlannerEvent, IndexedTask} from "../types";
import {isDoneStatus} from "../settingsDefaults";
import {
	taskStartMinutes,
	type ForecastCalendarRow,
	type TasksViewDayEntry,
} from "../tasks/tasksViewModel";
import {occurrenceScheduledIso} from "../tasks/horizonRecurringOccurrences";
import {isoDateOnly} from "../recurrence/recurrenceEngine";
import {taskDisplayTitle} from "../utils/inlineTasks";
import {parseDateTime} from "../utils/dateTimeParse";
import {meetingEffectiveMinutes} from "../utils/meetingEffectiveMinutes";

const MORNING_END = 12 * 60;
const DEFAULT_DURATION = 30;

export type TodayFeedKind = "meeting" | "calendar" | "note" | "planner" | "daily" | "task";

export type TodayFeedItem = {
	key: string;
	kind: TodayFeedKind;
	title: string;
	startMinutes: number | null;
	durationMinutes: number | null;
	subtitle?: string;
	filePath?: string;
	meeting?: IndexedMeeting;
	note?: AtomicNoteRow;
	planner?: IndexedPlannerEvent;
	eventId?: string;
	task?: IndexedTask;
	occurrenceDateIso?: string;
	isGhostOccurrence?: boolean;
	/** Linked project note, for icon color. */
	projectPath?: string;
	/** Calendar event place, when EventKit has one. */
	location?: string;
	/** Logged time (minutes). Shown in preference to a planned duration. */
	trackedMinutes?: number;
	/** Planned length from the note, task, or calendar event. Not a layout default. */
	explicitDurationMinutes?: number | null;
	/** EventKit calendar color. */
	calendarColor?: string;
	/** Task is done, or this recurring occurrence is in complete_instances. */
	done?: boolean;
};

export type TodayFeedSection = {
	key: "allDay" | "morning" | "afternoon";
	label: string;
	items: TodayFeedItem[];
};

function stripWikiMarkup(s: string): string {
	return s
		.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1")
		.replace(/^\[\[|\]\]$/g, "")
		.trim();
}

function fileDisplayName(file: {basename: string} | null | undefined): string | undefined {
	const name = file?.basename.replace(/\.md$/i, "").trim();
	return name || undefined;
}

function feedSubtitle(...parts: (string | undefined | null)[]): string | undefined {
	const out = parts
		.map((p) => (p ? stripWikiMarkup(p) : ""))
		.filter(Boolean);
	return out.length ? out.join(" · ") : undefined;
}

export function meetingTitle(m: IndexedMeeting): string {
	return m.title?.trim() || m.file.basename.replace(/\.md$/i, "");
}

function meetingTiming(m: IndexedMeeting): {startMinutes: number | null; durationMinutes: number | null} {
	const parsed = parseDateTime(m.date);
	if (!parsed) return {startMinutes: null, durationMinutes: null};
	const isAllDay = parsed.minutesFromMidnight == null;
	const effective = meetingEffectiveMinutes(m);
	const duration = effective > 0 ? effective : isAllDay ? null : DEFAULT_DURATION;
	return {startMinutes: parsed.minutesFromMidnight, durationMinutes: duration};
}

function noteTiming(n: AtomicNoteRow): {startMinutes: number | null; durationMinutes: number | null} {
	const timeRaw = n.startTime?.trim() || n.dateSort?.trim();
	const parsed = parseDateTime(timeRaw);
	if (!parsed) return {startMinutes: null, durationMinutes: null};
	const isAllDay = parsed.minutesFromMidnight == null;
	return {
		startMinutes: parsed.minutesFromMidnight,
		durationMinutes: isAllDay ? null : DEFAULT_DURATION,
	};
}

function taskEntryTiming(
	entry: TasksViewDayEntry,
): {startMinutes: number | null; durationMinutes: number | null} {
	let start: number | null;
	if (entry.occurrenceDateIso) {
		start =
			parseDateTime(occurrenceScheduledIso(entry.task, entry.occurrenceDateIso))
				?.minutesFromMidnight ?? null;
	} else {
		start = taskStartMinutes(entry.task);
	}
	if (start == null) return {startMinutes: null, durationMinutes: null};
	const duration = entry.task.durationMinutes;
	return {
		startMinutes: start,
		durationMinutes: duration != null && duration > 0 ? duration : DEFAULT_DURATION,
	};
}

export function formatFeedMinutes(n: number): string {
	const mins = Math.round(n);
	if (mins < 1) return "";
	if (mins < 60) return `${mins}min`;
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Tracked time when present, otherwise an explicit planned duration. */
export function todayFeedTimeLabel(
	item: Pick<TodayFeedItem, "trackedMinutes" | "explicitDurationMinutes">,
): string | null {
	const tracked = item.trackedMinutes ?? 0;
	if (tracked > 0) {
		const label = formatFeedMinutes(tracked);
		return label || null;
	}
	const planned = item.explicitDurationMinutes ?? 0;
	if (planned > 0) {
		const label = formatFeedMinutes(planned);
		return label || null;
	}
	return null;
}

function positiveMinutes(n: number | null | undefined): number | undefined {
	if (n == null || !Number.isFinite(n) || n <= 0) return undefined;
	return Math.round(n);
}

function meetingExplicitDuration(m: IndexedMeeting): number | null {
	const fromField = positiveMinutes(m.duration);
	if (fromField) return fromField;
	const startRaw = m.date?.trim();
	const endRaw = m.endTime?.trim();
	if (!startRaw || !endRaw) return null;
	const startMs = Date.parse(startRaw);
	const endMs = Date.parse(endRaw);
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
	return positiveMinutes(Math.round((endMs - startMs) / 60_000)) ?? null;
}

function taskEntryDone(entry: TasksViewDayEntry, doneStatuses: Set<string> | undefined): boolean {
	if (entry.occurrenceDateIso) {
		const hit = (entry.task.completeInstances ?? []).some(
			(d) => isoDateOnly(d) === entry.occurrenceDateIso,
		);
		if (hit) return true;
	}
	if (!doneStatuses) return false;
	return isDoneStatus(entry.task.status ?? "", doneStatuses);
}

export function todayTaskFeedItem(
	entry: TasksViewDayEntry,
	doneStatuses?: Set<string>,
): TodayFeedItem {
	const timing = taskEntryTiming(entry);
	return {
		key: `task:${entry.task.file.path}:${entry.occurrenceDateIso ?? ""}:${entry.task.line ?? ""}`,
		kind: "task",
		title: taskDisplayTitle(entry.task),
		startMinutes: timing.startMinutes,
		durationMinutes: timing.durationMinutes,
		explicitDurationMinutes: positiveMinutes(entry.task.durationMinutes) ?? null,
		trackedMinutes: positiveMinutes(entry.task.trackedMinutes),
		subtitle: fileDisplayName(entry.task.projectFile),
		filePath: entry.task.file.path,
		projectPath: entry.task.projectFile?.path,
		task: entry.task,
		occurrenceDateIso: entry.occurrenceDateIso,
		isGhostOccurrence: entry.isGhostOccurrence === true,
		done: taskEntryDone(entry, doneStatuses),
	};
}

function compareFeedItems(a: TodayFeedItem, b: TodayFeedItem): number {
	if (a.startMinutes == null && b.startMinutes == null) return a.title.localeCompare(b.title);
	if (a.startMinutes == null) return -1;
	if (b.startMinutes == null) return 1;
	if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
	return a.title.localeCompare(b.title);
}

function sectionForStart(startMinutes: number | null): TodayFeedSection["key"] {
	if (startMinutes == null) return "allDay";
	return startMinutes < MORNING_END ? "morning" : "afternoon";
}

export function buildTodayFeed(params: {
	dateIso: string;
	meetings: IndexedMeeting[];
	notes: AtomicNoteRow[];
	calendarEvents: ForecastCalendarRow[];
	plannerEvents: IndexedPlannerEvent[];
	dayTasks?: TasksViewDayEntry[];
	dailyNoteTitle?: string | null;
	dailyNotePath?: string | null;
	doneStatuses?: Set<string>;
}): TodayFeedSection[] {
	const {dateIso} = params;
	const items: TodayFeedItem[] = [];

	if (params.dailyNoteTitle) {
		items.push({
			key: `daily:${dateIso}`,
			kind: "daily",
			title: params.dailyNoteTitle,
			startMinutes: null,
			durationMinutes: null,
			subtitle: "Daily note",
			filePath: params.dailyNotePath ?? undefined,
		});
	}

	for (const m of params.meetings) {
		const day = (m.date ?? "").slice(0, 10);
		if (day !== dateIso) continue;
		const timing = meetingTiming(m);
		items.push({
			key: `meeting:${m.file.path}`,
			kind: "meeting",
			title: meetingTitle(m),
			startMinutes: timing.startMinutes,
			durationMinutes: timing.durationMinutes,
			explicitDurationMinutes: meetingExplicitDuration(m),
			trackedMinutes: positiveMinutes(m.totalMinutesTracked),
			subtitle: fileDisplayName(m.projectFile),
			meeting: m,
			filePath: m.file.path,
			projectPath: m.projectFile?.path,
		});
	}

	for (const n of params.notes) {
		const day = n.dateSort.slice(0, 10);
		if (day !== dateIso) continue;
		const timing = noteTiming(n);
		items.push({
			key: `note:${n.file.path}`,
			kind: "note",
			title: n.entryTitle?.trim() || n.file.basename.replace(/\.md$/i, ""),
			startMinutes: timing.startMinutes,
			durationMinutes: timing.durationMinutes,
			trackedMinutes: positiveMinutes(n.trackedMinutes),
			subtitle: feedSubtitle(fileDisplayName(n.projectFile), n.noteType) ?? n.bodyPreview,
			note: n,
			filePath: n.file.path,
			projectPath: n.projectFile?.path,
		});
	}

	for (const ev of params.calendarEvents) {
		if (ev.dateIso !== dateIso) continue;
		const location = ev.location?.trim() || undefined;
		items.push({
			key: `cal:${ev.eventId}`,
			kind: "calendar",
			title: ev.title,
			startMinutes: ev.startMinutes,
			durationMinutes: ev.durationMinutes,
			explicitDurationMinutes: positiveMinutes(ev.durationMinutes) ?? null,
			subtitle: location || ev.calendarTitle,
			location,
			calendarColor: ev.calendarColor,
			eventId: ev.eventId,
		});
	}

	for (const p of params.plannerEvents) {
		if (p.dateIso !== dateIso) continue;
		items.push({
			key: `planner:${p.file.path}:${p.line}`,
			kind: "planner",
			title: p.title,
			startMinutes: p.startMinutes,
			durationMinutes: p.durationMinutes,
			explicitDurationMinutes: positiveMinutes(p.durationMinutes) ?? null,
			trackedMinutes: positiveMinutes(p.trackedMinutes),
			subtitle: fileDisplayName(p.projectFile) || "Planner",
			projectPath: p.projectFile?.path,
			planner: p,
		});
	}

	for (const entry of params.dayTasks ?? []) {
		items.push(todayTaskFeedItem(entry, params.doneStatuses));
	}

	items.sort(compareFeedItems);

	const buckets: Record<TodayFeedSection["key"], TodayFeedItem[]> = {
		allDay: [],
		morning: [],
		afternoon: [],
	};
	for (const item of items) {
		buckets[sectionForStart(item.startMinutes)].push(item);
	}

	const sections: TodayFeedSection[] = [];
	if (buckets.allDay.length) sections.push({key: "allDay", label: "All day", items: buckets.allDay});
	if (buckets.morning.length) sections.push({key: "morning", label: "Morning", items: buckets.morning});
	if (buckets.afternoon.length) {
		sections.push({key: "afternoon", label: "Afternoon", items: buckets.afternoon});
	}
	return sections;
}
