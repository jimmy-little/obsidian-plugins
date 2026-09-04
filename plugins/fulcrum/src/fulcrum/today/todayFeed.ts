import type {AtomicNoteRow, IndexedMeeting, IndexedPlannerEvent} from "../types";
import type {ForecastCalendarRow} from "../tasks/tasksViewModel";
import {parseDateTime} from "../utils/dateTimeParse";
import {meetingEffectiveMinutes} from "../utils/meetingEffectiveMinutes";

const MORNING_END = 12 * 60;
const DEFAULT_DURATION = 30;

export type TodayFeedKind = "meeting" | "calendar" | "note" | "planner" | "daily";

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
};

export type TodayFeedSection = {
	key: "allDay" | "morning" | "afternoon";
	label: string;
	items: TodayFeedItem[];
};

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
	dailyNoteTitle?: string | null;
	dailyNotePath?: string | null;
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
			subtitle: m.projectFile?.basename.replace(/\.md$/i, "") || undefined,
			meeting: m,
			filePath: m.file.path,
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
			subtitle: n.noteType || n.bodyPreview || undefined,
			note: n,
			filePath: n.file.path,
		});
	}

	for (const ev of params.calendarEvents) {
		if (ev.dateIso !== dateIso) continue;
		items.push({
			key: `cal:${ev.eventId}`,
			kind: "calendar",
			title: ev.title,
			startMinutes: ev.startMinutes,
			durationMinutes: ev.durationMinutes,
			subtitle: ev.calendarTitle,
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
			subtitle: p.projectFile?.basename.replace(/\.md$/i, "") || "Planner",
			planner: p,
		});
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
