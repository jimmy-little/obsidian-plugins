import type {FulcrumSettings} from "../settingsDefaults";
import type {IndexedMeeting, IndexedPlannerEvent, IndexedTask, IndexSnapshot} from "../types";
import {parseDateTime} from "../utils/dateTimeParse";
import {filterForecastCalendarsAgainstMeetings} from "../utils/calendarOccurrenceDedupe";
import {addDaysIso, todayLocalISODate} from "../utils/dates";
import {sortIndexedTasks} from "../utils/taskListSort";
import {
	horizonRecurringOccurrenceDates,
	isRecurringParentTask,
	occurrenceScheduledIso,
} from "./horizonRecurringOccurrences";

export type TasksViewGroupBy = "day" | "project" | "tag";

export type TasksViewColumnId =
	| "title"
	| "project"
	| "scheduled"
	| "due"
	| "tags"
	| "status"
	| "priority";

export const DEFAULT_TASKS_VIEW_COLUMNS: TasksViewColumnId[] = [
	"title",
	"project",
	"scheduled",
	"due",
	"tags",
];

export const TASKS_VIEW_COLUMN_LABELS: Record<TasksViewColumnId, string> = {
	title: "Task",
	project: "Project",
	scheduled: "Scheduled",
	due: "Due",
	tags: "Tags",
	status: "Status",
	priority: "Priority",
};

const NONE_KEY = "__none__";
const UNTAGGED_KEY = "__untagged__";
const PAST_DUE_KEY = "__past_due__";
const UNSCHEDULED_KEY = "__unscheduled__";
const PAST_STRIP_KEY = "__past__";
const FUTURE_STRIP_KEY = "__future__";

/** System calendar event row for Forecast day merge. */
export type ForecastCalendarRow = {
	eventId: string;
	title: string;
	dateIso: string;
	startMinutes: number | null;
	durationMinutes: number | null;
	calendarTitle?: string;
};

export type TasksViewItem =
	| {kind: "task"; task: IndexedTask; occurrenceDateIso?: string; isGhostOccurrence?: boolean}
	| {
			kind: "meeting";
			meeting: IndexedMeeting;
			dateIso: string;
			startMinutes: number | null;
	  }
	| {
			kind: "calendar";
			eventId: string;
			title: string;
			dateIso: string;
			startMinutes: number | null;
			durationMinutes: number | null;
			calendarTitle?: string;
	  };

export type TasksViewSection = {
	key: string;
	label: string;
	/** Task rows only (for counts and DnD). */
	tasks: IndexedTask[];
	/** Merged display rows (tasks + read-only info). */
	items: TasksViewItem[];
	/** Canonical ISO for day drops / scroll targets */
	dropDateIso?: string | null;
	/** Project path for project drops */
	dropProjectPath?: string | null;
	/** Tag name for tag drops */
	dropTag?: string | null;
	defaultExpanded?: boolean;
};

export type WeekStripBlock = {
	key: string;
	/** Short column header (weekday or bucket name). */
	dayName: string;
	/** Secondary label inside the block (e.g. Today). */
	label: string;
	count: number;
	dateIso?: string;
	isToday?: boolean;
	isPast?: boolean;
	isFuture?: boolean;
};

export type BuildTasksViewSectionsOptions = {
	meetings?: IndexedMeeting[];
	calendarEvents?: ForecastCalendarRow[];
};

export type TasksViewDayEntry = {
	task: IndexedTask;
	occurrenceDateIso?: string;
	isGhostOccurrence?: boolean;
};

/** Due primary; fall back to scheduled. Recurring parents use scheduled (not a far-future due). */
export function taskPrimaryDateIso(task: IndexedTask): string | null {
	if (isRecurringParentTask(task)) {
		const sched = task.scheduledDate?.slice(0, 10);
		if (sched && /^\d{4}-\d{2}-\d{2}$/.test(sched)) return sched;
	}
	const due = task.dueDate?.slice(0, 10);
	if (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
	const sched = task.scheduledDate?.slice(0, 10);
	if (sched && /^\d{4}-\d{2}-\d{2}$/.test(sched)) return sched;
	return null;
}

function dayEntryPrimaryDate(entry: TasksViewDayEntry): string | null {
	if (entry.occurrenceDateIso) return entry.occurrenceDateIso;
	return taskPrimaryDateIso(entry.task);
}

function taskStartMinutesForEntry(entry: TasksViewDayEntry): number | null {
	if (entry.occurrenceDateIso) {
		const effective = occurrenceScheduledIso(entry.task, entry.occurrenceDateIso);
		return parseDateTime(effective)?.minutesFromMidnight ?? null;
	}
	return taskStartMinutes(entry.task);
}

export function meetingPrimaryDateIso(m: IndexedMeeting): string | null {
	const parsed = parseDateTime(m.date);
	return parsed?.dateIso ?? null;
}

/** Minutes from midnight when the task has an explicit time (scheduled, due, or logged window). */
export function taskStartMinutes(task: IndexedTask): number | null {
	const sched = parseDateTime(task.scheduledDate);
	if (sched?.minutesFromMidnight != null) return sched.minutesFromMidnight;
	const due = parseDateTime(task.dueDate);
	if (due?.minutesFromMidnight != null) return due.minutesFromMidnight;
	if (task.startTime?.trim() && task.endTime?.trim()) {
		const a = Date.parse(task.startTime.trim());
		const b = Date.parse(task.endTime.trim());
		if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
			const d = new Date(a);
			return d.getHours() * 60 + d.getMinutes();
		}
	}
	return null;
}

export function meetingStartMinutes(m: IndexedMeeting): number | null {
	return parseDateTime(m.date)?.minutesFromMidnight ?? null;
}

export function formatMinutesLabel(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	const period = h >= 12 ? "PM" : "AM";
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function tasksToItems(tasks: IndexedTask[]): TasksViewItem[] {
	return tasks.map((task) => ({kind: "task", task}));
}

function entriesToItems(entries: TasksViewDayEntry[]): TasksViewItem[] {
	return entries.map(({task, occurrenceDateIso, isGhostOccurrence}) => ({
		kind: "task",
		task,
		occurrenceDateIso,
		isGhostOccurrence,
	}));
}

function sortDayEntries(
	entries: TasksViewDayEntry[],
	sortBy: FulcrumSettings["taskSidebarSortBy"],
	sortDir: FulcrumSettings["taskSidebarSortDir"],
): TasksViewDayEntry[] {
	return [...entries].sort((a, b) => {
		const aTask = a.task;
		const bTask = b.task;
		const aSched = a.occurrenceDateIso
			? occurrenceScheduledIso(aTask, a.occurrenceDateIso)
			: aTask.scheduledDate;
		const bSched = b.occurrenceDateIso
			? occurrenceScheduledIso(bTask, b.occurrenceDateIso)
			: bTask.scheduledDate;
		const aView = a.occurrenceDateIso
			? {...aTask, scheduledDate: aSched, dueDate: a.occurrenceDateIso}
			: aTask;
		const bView = b.occurrenceDateIso
			? {...bTask, scheduledDate: bSched, dueDate: b.occurrenceDateIso}
			: bTask;
		const sorted = sortIndexedTasks([aView, bView], sortBy, sortDir);
		if (sorted[0] === aView && sorted[1] === bView) return -1;
		if (sorted[0] === bView && sorted[1] === aView) return 1;
		return 0;
	});
}

function bucketDayEntry(
	entry: TasksViewDayEntry,
	today: string,
	dayKeys: Set<string>,
	pastDue: TasksViewDayEntry[],
	byDay: Map<string, TasksViewDayEntry[]>,
	futureBeyond: TasksViewDayEntry[],
): void {
	const iso = dayEntryPrimaryDate(entry);
	if (!iso) return;
	if (iso < today) {
		pastDue.push(entry);
		return;
	}
	if (byDay.has(iso)) {
		byDay.get(iso)!.push(entry);
		return;
	}
	futureBeyond.push(entry);
}

function bucketTaskByPrimaryDate(
	task: IndexedTask,
	today: string,
	dayKeys: Set<string>,
	pastDue: TasksViewDayEntry[],
	byDay: Map<string, TasksViewDayEntry[]>,
	unscheduled: IndexedTask[],
	futureBeyond: TasksViewDayEntry[],
): void {
	if (isRecurringParentTask(task)) {
		for (const [idx, iso] of horizonRecurringOccurrenceDates(task, today).entries()) {
			bucketDayEntry(
				{task, occurrenceDateIso: iso, isGhostOccurrence: idx > 0},
				today,
				dayKeys,
				pastDue,
				byDay,
				futureBeyond,
			);
		}
		return;
	}

	const iso = taskPrimaryDateIso(task);
	if (!iso) {
		unscheduled.push(task);
		return;
	}
	bucketDayEntry({task}, today, dayKeys, pastDue, byDay, futureBeyond);
}

type TimedSortEntry = {
	startMinutes: number;
	kind: "meeting" | "calendar" | "task";
	entry?: TasksViewDayEntry;
	meeting?: IndexedMeeting;
	calendar?: ForecastCalendarRow;
};

/** Merge tasks, meetings, and calendar rows for one day section. */
export function mergeDayItems(
	entries: TasksViewDayEntry[],
	meetings: IndexedMeeting[],
	calendars: ForecastCalendarRow[],
	settings: FulcrumSettings,
): TasksViewItem[] {
	const sortBy = settings.taskSidebarSortBy;
	const sortDir = settings.taskSidebarSortDir;
	const timed: TimedSortEntry[] = [];
	const untimedMeetings: IndexedMeeting[] = [];
	const untimedCalendars: ForecastCalendarRow[] = [];
	const untimedEntries: TasksViewDayEntry[] = [];

	for (const entry of entries) {
		const mins = taskStartMinutesForEntry(entry);
		if (mins != null) timed.push({startMinutes: mins, kind: "task", entry});
		else untimedEntries.push(entry);
	}
	for (const m of meetings) {
		const mins = meetingStartMinutes(m);
		if (mins != null) timed.push({startMinutes: mins, kind: "meeting", meeting: m});
		else untimedMeetings.push(m);
	}
	for (const c of calendars) {
		if (c.startMinutes != null) {
			timed.push({startMinutes: c.startMinutes, kind: "calendar", calendar: c});
		} else {
			untimedCalendars.push(c);
		}
	}

	const kindOrder: Record<TimedSortEntry["kind"], number> = {
		meeting: 0,
		calendar: 1,
		task: 2,
	};
	timed.sort((a, b) => {
		if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
		return kindOrder[a.kind] - kindOrder[b.kind];
	});

	untimedMeetings.sort((a, b) =>
		(a.title ?? a.file.basename).localeCompare(b.title ?? b.file.basename),
	);
	untimedCalendars.sort((a, b) => a.title.localeCompare(b.title));

	const items: TasksViewItem[] = [];
	for (const e of timed) {
		if (e.kind === "task" && e.entry) {
			items.push({
				kind: "task",
				task: e.entry.task,
				occurrenceDateIso: e.entry.occurrenceDateIso,
				isGhostOccurrence: e.entry.isGhostOccurrence,
			});
		} else if (e.kind === "meeting" && e.meeting) {
			const parsed = parseDateTime(e.meeting.date);
			items.push({
				kind: "meeting",
				meeting: e.meeting,
				dateIso: parsed?.dateIso ?? meetingPrimaryDateIso(e.meeting) ?? "",
				startMinutes: e.startMinutes,
			});
		} else if (e.kind === "calendar" && e.calendar) {
			items.push({kind: "calendar", ...e.calendar});
		}
	}
	for (const m of untimedMeetings) {
		items.push({
			kind: "meeting",
			meeting: m,
			dateIso: meetingPrimaryDateIso(m) ?? "",
			startMinutes: null,
		});
	}
	for (const c of untimedCalendars) {
		items.push({kind: "calendar", ...c});
	}
	for (const entry of sortDayEntries(untimedEntries, sortBy, sortDir)) {
		items.push({
			kind: "task",
			task: entry.task,
			occurrenceDateIso: entry.occurrenceDateIso,
			isGhostOccurrence: entry.isGhostOccurrence,
		});
	}
	return items;
}

function bucketMeetingsByDay(
	meetings: IndexedMeeting[],
	today: string,
	dayKeys: Set<string>,
): {inWindow: Map<string, IndexedMeeting[]>; beyond: IndexedMeeting[]} {
	const inWindow = new Map<string, IndexedMeeting[]>();
	const beyond: IndexedMeeting[] = [];
	for (const m of meetings) {
		const iso = meetingPrimaryDateIso(m);
		if (!iso || iso < today) continue;
		if (dayKeys.has(iso)) {
			const cur = inWindow.get(iso) ?? [];
			cur.push(m);
			inWindow.set(iso, cur);
		} else {
			beyond.push(m);
		}
	}
	return {inWindow, beyond};
}

function bucketCalendarsByDay(
	events: ForecastCalendarRow[],
	today: string,
	dayKeys: Set<string>,
): {inWindow: Map<string, ForecastCalendarRow[]>; beyond: ForecastCalendarRow[]} {
	const inWindow = new Map<string, ForecastCalendarRow[]>();
	const beyond: ForecastCalendarRow[] = [];
	for (const e of events) {
		if (!e.dateIso || e.dateIso < today) continue;
		if (dayKeys.has(e.dateIso)) {
			const cur = inWindow.get(e.dateIso) ?? [];
			cur.push(e);
			inWindow.set(e.dateIso, cur);
		} else {
			beyond.push(e);
		}
	}
	return {inWindow, beyond};
}

export function taskDisplayTags(task: IndexedTask, settings: FulcrumSettings): string[] {
	const designated = settings.taskTag.trim().replace(/^#/, "").toLowerCase();
	const raw =
		task.source === "inline" && task.inlineTags?.length
			? task.inlineTags
			: task.tags;
	const out: string[] = [];
	const seen = new Set<string>();
	for (const t of raw) {
		const norm = t.trim().replace(/^#/, "");
		if (!norm) continue;
		if (settings.taskSuppressDesignatedTagInDisplay && designated && norm.toLowerCase() === designated) {
			continue;
		}
		const lc = norm.toLowerCase();
		if (seen.has(lc)) continue;
		seen.add(lc);
		out.push(norm);
	}
	return out;
}

export function buildWeekStripBlocks(tasks: IndexedTask[], today = todayLocalISODate()): WeekStripBlock[] {
	const todayPlus6 = addDaysIso(today, 6);
	const dayIsos = [today];
	for (let i = 1; i <= 6; i++) dayIsos.push(addDaysIso(today, i));

	let pastCount = 0;
	let futureCount = 0;
	const dayCounts = new Map<string, number>();
	for (const iso of dayIsos) dayCounts.set(iso, 0);

	for (const t of tasks) {
		if (isRecurringParentTask(t)) {
			for (const iso of horizonRecurringOccurrenceDates(t, today)) {
				if (iso < today) pastCount++;
				else if (iso > todayPlus6) futureCount++;
				else dayCounts.set(iso, (dayCounts.get(iso) ?? 0) + 1);
			}
			continue;
		}
		const iso = taskPrimaryDateIso(t);
		if (!iso) continue;
		if (iso < today) {
			pastCount++;
		} else if (iso > todayPlus6) {
			futureCount++;
		} else {
			dayCounts.set(iso, (dayCounts.get(iso) ?? 0) + 1);
		}
	}

	const blocks: WeekStripBlock[] = [
		{key: PAST_STRIP_KEY, dayName: "Past", label: "Past", count: pastCount, isPast: true},
	];

	for (let i = 0; i < dayIsos.length; i++) {
		const iso = dayIsos[i]!;
		const d = new Date(`${iso}T12:00:00`);
		const weekday = d.toLocaleDateString(undefined, {weekday: "short"});
		const dayNum = d.getDate();
		blocks.push({
			key: iso,
			dayName: weekday,
			label: i === 0 ? "Today" : String(dayNum),
			count: dayCounts.get(iso) ?? 0,
			dateIso: iso,
			isToday: i === 0,
		});
	}

	blocks.push({
		key: FUTURE_STRIP_KEY,
		dayName: "Future",
		label: "Future",
		count: futureCount,
		isFuture: true,
	});

	return blocks;
}

export function weekStripDropDateIso(block: WeekStripBlock, today = todayLocalISODate()): string | null {
	if (block.dateIso) return block.dateIso;
	if (block.isPast) return addDaysIso(today, -1);
	if (block.isFuture) return addDaysIso(today, 7);
	return null;
}

function formatDaySectionLabel(iso: string, today: string): string {
	if (iso === today) {
		const d = new Date(`${iso}T12:00:00`);
		const weekday = d.toLocaleDateString(undefined, {weekday: "short"});
		return `Today — ${weekday}, ${d.toLocaleDateString(undefined, {month: "short", day: "numeric"})}`;
	}
	const d = new Date(`${iso}T12:00:00`);
	return d.toLocaleDateString(undefined, {weekday: "short", month: "short", day: "numeric"});
}

export function buildDaySections(
	tasks: IndexedTask[],
	settings: FulcrumSettings,
	futureDays: number,
	today = todayLocalISODate(),
	options?: BuildTasksViewSectionsOptions,
): TasksViewSection[] {
	const sortBy = settings.taskSidebarSortBy;
	const sortDir = settings.taskSidebarSortDir;
	const meetings = options?.meetings ?? [];
	const calendarEvents = filterForecastCalendarsAgainstMeetings(
		options?.calendarEvents ?? [],
		meetings,
	);

	const pastDue: TasksViewDayEntry[] = [];
	const byDay = new Map<string, TasksViewDayEntry[]>();
	const unscheduled: IndexedTask[] = [];
	const futureBeyond: TasksViewDayEntry[] = [];
	const dayKeys = new Set<string>();

	for (let i = 0; i <= futureDays; i++) {
		const iso = addDaysIso(today, i);
		byDay.set(iso, []);
		dayKeys.add(iso);
	}

	for (const t of tasks) {
		bucketTaskByPrimaryDate(t, today, dayKeys, pastDue, byDay, unscheduled, futureBeyond);
	}

	const {inWindow: meetingsByDay, beyond: meetingsBeyond} = bucketMeetingsByDay(
		meetings,
		today,
		dayKeys,
	);
	const {inWindow: calendarsByDay, beyond: calendarsBeyond} = bucketCalendarsByDay(
		calendarEvents,
		today,
		dayKeys,
	);

	const sections: TasksViewSection[] = [];

	if (pastDue.length > 0) {
		const sorted = sortDayEntries(pastDue, sortBy, sortDir);
		const sortedTasks = sorted.map((e) => e.task);
		sections.push({
			key: PAST_DUE_KEY,
			label: "Past due",
			tasks: sortedTasks,
			items: entriesToItems(sorted),
			dropDateIso: addDaysIso(today, -1),
			defaultExpanded: true,
		});
	}

	for (let i = 0; i <= futureDays; i++) {
		const iso = addDaysIso(today, i);
		const list = byDay.get(iso) ?? [];
		const dayMeetings = meetingsByDay.get(iso) ?? [];
		const dayCalendars = calendarsByDay.get(iso) ?? [];
		const sorted = sortDayEntries(list, sortBy, sortDir);
		const sortedTasks = sorted.map((e) => e.task);
		const items = mergeDayItems(sorted, dayMeetings, dayCalendars, settings);
		if (items.length === 0 && i > 0) continue;
		sections.push({
			key: iso,
			label: formatDaySectionLabel(iso, today),
			tasks: sortedTasks,
			items,
			dropDateIso: iso,
			defaultExpanded: i === 0,
		});
	}

	const futureSorted = sortDayEntries(futureBeyond, sortBy, sortDir);
	const futureTasks = futureSorted.map((e) => e.task);
	const futureItems = mergeDayItems(futureSorted, meetingsBeyond, calendarsBeyond, settings);
	if (futureItems.length > 0) {
		sections.push({
			key: FUTURE_STRIP_KEY,
			label: "Future",
			tasks: futureTasks,
			items: futureItems,
			dropDateIso: addDaysIso(today, futureDays + 1),
			defaultExpanded: sectionDefaultExpandedForInline(futureTasks),
		});
	}

	if (unscheduled.length > 0) {
		const sorted = sortIndexedTasks(unscheduled, sortBy, sortDir);
		sections.push({
			key: UNSCHEDULED_KEY,
			label: "Unscheduled",
			tasks: sorted,
			items: tasksToItems(sorted),
			dropDateIso: null,
			defaultExpanded: unscheduledSectionDefaultExpanded(sorted, settings),
		});
	}

	return sections;
}

export function buildProjectSections(
	tasks: IndexedTask[],
	snapshot: IndexSnapshot,
	settings: FulcrumSettings,
): TasksViewSection[] {
	const sortBy = settings.taskSidebarSortBy;
	const sortDir = settings.taskSidebarSortDir;
	const map = new Map<string, IndexedTask[]>();

	for (const t of tasks) {
		const key = t.projectFile?.path ?? NONE_KEY;
		const cur = map.get(key) ?? [];
		cur.push(t);
		map.set(key, cur);
	}

	const keys = [...map.keys()].sort((a, b) => {
		if (a === NONE_KEY) return 1;
		if (b === NONE_KEY) return -1;
		const la = projectLabel(a, snapshot);
		const lb = projectLabel(b, snapshot);
		return la.localeCompare(lb);
	});

	return keys.map((k) => {
		const sorted = sortIndexedTasks(map.get(k) ?? [], sortBy, sortDir);
		return {
			key: k,
			label: k === NONE_KEY ? "No project" : projectLabel(k, snapshot),
			tasks: sorted,
			items: tasksToItems(sorted),
			dropProjectPath: k === NONE_KEY ? null : k,
			defaultExpanded: true,
		};
	});
}

export function buildTagSections(
	tasks: IndexedTask[],
	settings: FulcrumSettings,
): TasksViewSection[] {
	const sortBy = settings.taskSidebarSortBy;
	const sortDir = settings.taskSidebarSortDir;
	const map = new Map<string, IndexedTask[]>();

	for (const t of tasks) {
		const tags = taskDisplayTags(t, settings);
		if (tags.length === 0) {
			const cur = map.get(UNTAGGED_KEY) ?? [];
			cur.push(t);
			map.set(UNTAGGED_KEY, cur);
			continue;
		}
		for (const tag of tags) {
			const lc = tag.toLowerCase();
			const cur = map.get(lc) ?? [];
			cur.push(t);
			map.set(lc, cur);
		}
	}

	const keys = [...map.keys()].sort((a, b) => {
		if (a === UNTAGGED_KEY) return 1;
		if (b === UNTAGGED_KEY) return -1;
		return a.localeCompare(b);
	});

	return keys.map((k) => {
		const displayTag = k === UNTAGGED_KEY ? null : k;
		const label = k === UNTAGGED_KEY ? "Untagged" : displayTag!;
		const sorted = sortIndexedTasks(map.get(k) ?? [], sortBy, sortDir);
		return {
			key: k,
			label,
			tasks: sorted,
			items: tasksToItems(sorted),
			dropTag: displayTag,
			defaultExpanded: k !== UNTAGGED_KEY,
		};
	});
}

export function buildTasksViewSections(
	tasks: IndexedTask[],
	snapshot: IndexSnapshot,
	settings: FulcrumSettings,
	groupBy: TasksViewGroupBy,
	options?: BuildTasksViewSectionsOptions,
): TasksViewSection[] {
	switch (groupBy) {
		case "project":
			return buildProjectSections(tasks, snapshot, settings);
		case "tag":
			return buildTagSections(tasks, settings);
		default:
			return buildDaySections(tasks, settings, settings.tasksViewFutureDays, todayLocalISODate(), options);
	}
}

export function buildTaskDueCountsByDay(
	tasks: IndexedTask[],
	monthStart: Date,
): Map<string, number> {
	const y = monthStart.getFullYear();
	const m = monthStart.getMonth();
	const lastDay = new Date(y, m + 1, 0).getDate();
	const counts = new Map<string, number>();

	for (let day = 1; day <= lastDay; day++) {
		const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
		counts.set(iso, 0);
	}

	for (const t of tasks) {
		if (isRecurringParentTask(t)) {
			for (const iso of horizonRecurringOccurrenceDates(t, todayLocalISODate())) {
				if (!counts.has(iso)) continue;
				counts.set(iso, (counts.get(iso) ?? 0) + 1);
			}
			continue;
		}
		const iso = taskPrimaryDateIso(t);
		if (!iso || !counts.has(iso)) continue;
		counts.set(iso, (counts.get(iso) ?? 0) + 1);
	}

	return counts;
}

export function maxCountInMap(counts: Map<string, number>): number {
	let max = 0;
	for (const n of counts.values()) {
		if (n > max) max = n;
	}
	return max;
}

function projectLabel(path: string, snapshot: IndexSnapshot): string {
	const p = snapshot.projects.find((x) => x.file.path === path);
	return p?.name ?? path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
}

export function taskSourceFilterKey(task: IndexedTask): "inline" | "taskNote" {
	return task.source === "inline" ? "inline" : "taskNote";
}

export function horizonTaskDedupeKey(task: IndexedTask): string {
	return `${task.file.path}:${task.line ?? ""}`;
}

function plannerScheduledIso(ev: IndexedPlannerEvent): string {
	if (ev.startMinutes == null) return ev.dateIso;
	const h = Math.floor(ev.startMinutes / 60);
	const m = ev.startMinutes % 60;
	return `${ev.dateIso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function indexedTaskFromPlannerEvent(ev: IndexedPlannerEvent): IndexedTask {
	return {
		file: ev.file,
		line: ev.line,
		title: ev.title,
		status: ev.status,
		dueDate: undefined,
		scheduledDate: plannerScheduledIso(ev),
		projectFile: ev.projectFile,
		areaFile: null,
		tags: [],
		inlineTags: [],
		createdAtMs: ev.file.stat.ctime,
		source: "inline",
		trackedMinutes: ev.trackedMinutes,
	};
}

function sectionDefaultExpandedForInline(tasks: IndexedTask[]): boolean {
	return tasks.some((t) => t.source === "inline");
}

export function unscheduledSectionDefaultExpanded(
	unscheduled: IndexedTask[],
	settings: FulcrumSettings,
): boolean {
	const uncheckedSource = new Set(settings.taskSidebarFilterUncheckedSource ?? []);
	if (uncheckedSource.has("inline")) return false;
	return sectionDefaultExpandedForInline(unscheduled);
}

export function filterOpenTasksForTasksView(
	tasks: IndexedTask[],
	settings: FulcrumSettings,
): IndexedTask[] {
	const uncheckedStatus = new Set(settings.taskSidebarFilterUncheckedStatus ?? []);
	const uncheckedProject = new Set(settings.taskSidebarFilterUncheckedProject ?? []);
	const uncheckedSource = new Set(settings.taskSidebarFilterUncheckedSource ?? []);
	const statusSetLc = new Set([...uncheckedStatus].map((s) => s.toLowerCase()));

	return tasks.filter((t) => {
		const statusKey = t.status?.trim() ? t.status : NONE_KEY;
		const projectKey = t.projectFile?.path ?? NONE_KEY;
		if (uncheckedStatus.size > 0 && statusSetLc.has(statusKey.toLowerCase())) return false;
		if (uncheckedProject.size > 0 && uncheckedProject.has(projectKey)) return false;
		if (uncheckedSource.size > 0 && uncheckedSource.has(taskSourceFilterKey(t))) return false;
		return true;
	});
}

export function gridTemplateForColumns(columns: TasksViewColumnId[]): string {
	const tracks: string[] = ["1.75rem"];
	for (const col of columns) {
		switch (col) {
			case "title":
				tracks.push("minmax(6rem, 1.4fr)");
				break;
			case "project":
				tracks.push("minmax(4rem, 0.9fr)");
				break;
			case "scheduled":
			case "due":
				tracks.push("minmax(4.5rem, 0.75fr)");
				break;
			case "tags":
				tracks.push("minmax(4rem, 1fr)");
				break;
			case "status":
			case "priority":
				tracks.push("minmax(3rem, 0.6fr)");
				break;
		}
	}
	return tracks.join(" ");
}

export function tasksViewItemKey(item: TasksViewItem): string {
	if (item.kind === "task") {
		const base = `task:${item.task.file.path}:${item.task.line ?? ""}`;
		return item.occurrenceDateIso ? `${base}:occ:${item.occurrenceDateIso}` : base;
	}
	if (item.kind === "meeting") {
		return `meeting:${item.meeting.file.path}`;
	}
	return `calendar:${item.eventId}`;
}

/** Resolve a Horizon row selection key back to an indexed task. */
export function taskFromViewItemKey(
	tasks: IndexedTask[],
	key: string | null,
): IndexedTask | undefined {
	if (!key) return undefined;
	if (key.startsWith("{")) {
		try {
			const parsed = JSON.parse(key) as {
				path?: string;
				line?: number | null;
				source?: string;
			};
			if (!parsed.path || !parsed.source) return undefined;
			return tasks.find(
				(t) =>
					t.file.path === parsed.path &&
					(t.line ?? null) === (parsed.line ?? null) &&
					t.source === parsed.source,
			);
		} catch {
			return undefined;
		}
	}
	if (!key.startsWith("task:")) return undefined;
	const withoutPrefix = key.slice(5);
	const occIdx = withoutPrefix.indexOf(":occ:");
	const core = occIdx >= 0 ? withoutPrefix.slice(0, occIdx) : withoutPrefix;
	const lastColon = core.lastIndexOf(":");
	if (lastColon < 0) return tasks.find((t) => t.file.path === core);
	const path = core.slice(0, lastColon);
	const lineRaw = core.slice(lastColon + 1);
	if (lineRaw === "") {
		return tasks.find((t) => t.file.path === path && t.line == null);
	}
	const line = Number.parseInt(lineRaw, 10);
	if (!Number.isFinite(line)) return undefined;
	return tasks.find((t) => t.file.path === path && t.line === line);
}
