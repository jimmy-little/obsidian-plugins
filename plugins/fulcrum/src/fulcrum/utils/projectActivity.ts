import type {ProjectLogActivityEntry} from "../projectNote";
import type {AtomicNoteRow, IndexedMeeting, IndexedTask, ProjectRollup} from "../types";
import {
	formatShortMonthDay,
	formatShortMonthDayFromMs,
	isCalendarDayAfterToday,
	isISODateTodayOrFuture,
	tomorrowMidnightLocalMs,
} from "./dates";
import {meetingEffectiveMinutes} from "./meetingEffectiveMinutes";
import {resolveProjectAccentCss} from "./projectVisual";

export type ChipKind =
	| "tag"
	| "date"
	| "type"
	| "tracked"
	| "status"
	| "misc"
	| "project"
	| "fileTouch";

export type ActivityChip = {
	kind: ChipKind;
	label: string;
};

export type ActivityRowModel = {
	id: string;
	kind: "note" | "task" | "log" | "meeting";
	sortMs: number;
	title: string;
	chips: ActivityChip[];
	open: () => void;
	hoverPath?: string;
	/** Notes only: when the type (frontmatter) begins with an emoji, show it in the timeline circle. */
	timelineEmoji?: string;
	/** For aggregated feeds: project display name (e.g. "Project X"). */
	projectName?: string;
	/** For aggregated feeds: CSS color for timeline accent. */
	accentColorCss?: string;
};

export type NextUpItem = {
	kind: "task" | "note";
	task?: IndexedTask;
	note?: AtomicNoteRow;
};

type NextUpSortRow =
	| {key: string; kind: "task"; task: IndexedTask}
	| {key: string; kind: "note"; note: AtomicNoteRow}
	| {key: string; kind: "meeting"; meeting: IndexedMeeting};

export type NextUpSegments = {
	/** Meetings with date today or later, sorted ascending (same pool as before, split for card UI). */
	meetings: IndexedMeeting[];
	/** Tasks and notes only, same sort order as within the combined next-up window. */
	items: NextUpItem[];
};

/** Strip `[[…]]` wikilink syntax, returning the display text. */
function stripWikilinks(s: string): string {
	return s.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1");
}

function normalizeFulcrumTag(t: string): string {
	return t.replace(/^#/, "").trim().toLowerCase();
}

/**
 * Omit from project “Next up” when the Tasks block already covers it: same file as an open
 * indexed task, or frontmatter tags/type match the configured task tag (e.g. #task).
 */
function atomicNoteExcludedFromProjectNextUp(
	n: AtomicNoteRow,
	openTaskPaths: Set<string>,
	taskTag: string,
): boolean {
	if (openTaskPaths.has(n.file.path)) return true;
	const tagNorm = normalizeFulcrumTag(taskTag);
	if (!tagNorm) return false;
	if (n.tags.some((t) => normalizeFulcrumTag(t) === tagNorm)) return true;
	const typeNorm = n.noteType ? stripWikilinks(n.noteType).trim().toLowerCase() : "";
	if (typeNorm === tagNorm) return true;
	return false;
}

/**
 * If `noteType` (raw frontmatter / display form) starts with an emoji grapheme after wikilink
 * stripping, returns that grapheme for the activity timeline node; otherwise `undefined`.
 */
export function leadingTimelineEmojiFromNoteType(noteType: string | undefined): string | undefined {
	if (!noteType?.trim()) return undefined;
	const display = stripWikilinks(noteType).trimStart();
	if (!display) return undefined;
	try {
		const seg = new Intl.Segmenter(undefined, {granularity: "grapheme"});
		const first = [...seg.segment(display)][0];
		if (!first) return undefined;
		const g = first.segment;
		if (/\p{Extended_Pictographic}/u.test(g)) return g;
		return undefined;
	} catch {
		return undefined;
	}
}

function chipsForNote(n: AtomicNoteRow, formatTracked: (n: number) => string): ActivityChip[] {
	const c: ActivityChip[] = [];
	if (n.dateDisplay) c.push({kind: "date", label: n.dateDisplay});
	if (n.noteType) c.push({kind: "type", label: stripWikilinks(n.noteType)});
	for (const t of n.tags) c.push({kind: "tag", label: `#${t}`});
	if (n.trackedMinutes > 0) c.push({kind: "tracked", label: formatTracked(n.trackedMinutes)});
	if (n.priority) c.push({kind: "misc", label: n.priority});
	return c;
}

function chipsForTask(t: IndexedTask, formatTracked: (n: number) => string): ActivityChip[] {
	const c: ActivityChip[] = [];
	if (t.dueDate) c.push({kind: "date", label: `due ${t.dueDate.slice(0, 10)}`});
	if (t.scheduledDate) c.push({kind: "date", label: `sched ${t.scheduledDate.slice(0, 10)}`});
	if (t.completedDate) c.push({kind: "date", label: `done ${t.completedDate.slice(0, 10)}`});
	c.push({kind: "status", label: t.status});
	if (t.priority) c.push({kind: "misc", label: t.priority});
	for (const tag of t.tags) c.push({kind: "tag", label: `#${tag}`});
	if (t.trackedMinutes > 0) c.push({kind: "tracked", label: formatTracked(t.trackedMinutes)});
	return c;
}

function chipsForLog(e: ProjectLogActivityEntry): ActivityChip[] {
	const c: ActivityChip[] = [];
	if (e.stampLabel) c.push({kind: "date", label: e.stampLabel});
	return c;
}

function chipsForMeeting(m: IndexedMeeting, formatTracked: (n: number) => string): ActivityChip[] {
	const c: ActivityChip[] = [];
	if (m.date?.trim()) {
		const day = m.date.trim().slice(0, 10);
		c.push({kind: "date", label: formatShortMonthDay(day) || day});
	}
	c.push({kind: "type", label: "Meeting"});
	const eff = meetingEffectiveMinutes(m);
	if (eff > 0) c.push({kind: "tracked", label: formatTracked(eff)});
	return c;
}

/** File last-modified (vault), shown in activity feeds so sort order matches visible metadata. */
function chipFileModifiedMeta(fileMtimeMs: number): ActivityChip {
	return {
		kind: "fileTouch",
		label: formatShortMonthDayFromMs(fileMtimeMs),
	};
}

function appendFileModifiedChip(
	chips: ActivityChip[],
	rowKind: ActivityRowModel["kind"],
	fileMtimeMs: number,
): ActivityChip[] {
	if (rowKind === "log") return chips;
	return [...chips, chipFileModifiedMeta(fileMtimeMs)];
}

/** One-line when string for Next up meeting cards: weekday · date · time · duration. */
export function formatNextUpMeetingWhen(m: IndexedMeeting): string {
	const raw = m.date?.trim() ?? "";
	if (!raw) return "";
	const datePart = raw.slice(0, 10);
	const noon = Date.parse(datePart + "T12:00:00");
	const dayName = Number.isNaN(noon)
		? ""
		: new Intl.DateTimeFormat("en-US", {weekday: "short"}).format(noon);
	const dateStr = formatShortMonthDay(datePart) || datePart;
	let timePart = "";
	if (raw.length > 10 && raw.includes("T")) {
		const ms = Date.parse(raw);
		if (!Number.isNaN(ms)) {
			timePart = new Intl.DateTimeFormat("en-US", {
				hour: "numeric",
				minute: "2-digit",
			}).format(ms);
		}
	}
	const eff = meetingEffectiveMinutes(m);
	const dur = eff > 0 ? `${eff} min` : "";
	return [dayName, dateStr, timePart, dur].filter(Boolean).join(" · ");
}

export function sortMsForMeeting(m: IndexedMeeting): number {
	if (m.date?.trim()) {
		const t = Date.parse(m.date.slice(0, 10) + "T12:00:00");
		if (!Number.isNaN(t)) return t;
	}
	return m.file.stat.mtime;
}

function earliestTodayOrFutureDueOrSched(t: IndexedTask): string | null {
	const keys: string[] = [];
	if (isISODateTodayOrFuture(t.dueDate)) keys.push(t.dueDate!.slice(0, 10));
	if (isISODateTodayOrFuture(t.scheduledDate)) keys.push(t.scheduledDate!.slice(0, 10));
	if (keys.length === 0) return null;
	return keys.sort()[0]!;
}

/** Open tasks (task notes + inline) that are not done by status and have no completion date. */
export function incompleteProjectTasks(tasks: IndexedTask[], doneTask: Set<string>): IndexedTask[] {
	return tasks.filter(
		(t) => !doneTask.has(t.status) && !t.completedDate?.trim(),
	);
}

export function taskIsComplete(t: IndexedTask, doneTask: Set<string>): boolean {
	return doneTask.has(t.status) || Boolean(t.completedDate?.trim());
}

/**
 * Wall-clock end instant when we can derive it: explicit `endTime`, or `date` (datetime) + effective duration.
 * Date-only meetings return null (calendar rules apply via {@link isISODateTodayOrFuture}).
 */
function meetingTimedEndMs(m: IndexedMeeting): number | null {
	const endTrim = m.endTime?.trim();
	if (endTrim) {
		const t = Date.parse(endTrim);
		if (!Number.isNaN(t)) return t;
	}
	const raw = m.date?.trim() ?? "";
	if (!raw) return null;
	const eff = meetingEffectiveMinutes(m);
	if (eff <= 0) return null;
	const hasTime = raw.length > 10 && raw.includes("T");
	if (!hasTime) return null;
	const startMs = Date.parse(raw);
	if (Number.isNaN(startMs)) return null;
	return startMs + eff * 60_000;
}

function meetingIsPastForNextUp(m: IndexedMeeting): boolean {
	const endMs = meetingTimedEndMs(m);
	if (endMs != null) return endMs < Date.now();
	return false;
}

function meetingNextUpKey(m: IndexedMeeting): string | null {
	if (!m.date?.trim()) return null;
	if (meetingIsPastForNextUp(m)) return null;
	const norm = m.date.trim().slice(0, 10);
	if (norm.length < 10) return null;
	if (!isISODateTodayOrFuture(m.date)) return null;
	return norm;
}

/**
 * Next up (project page): meetings (date today+, not already ended) and dated atomic notes — not indexed tasks
 * (they belong in the Tasks section). Notes whose file is an open task, or tagged / typed as `taskTag`, are omitted.
 * Atomic notes whose file is a linked meeting are omitted from `items` (shown only as meeting tiles).
 * Sorted ascending by date key; capped at `limit` total rows, then split into meetings vs note items.
 */
export function buildNextUpSegments(
	rollup: ProjectRollup,
	doneTask: Set<string>,
	limit = 8,
	taskTag: string = "task",
): NextUpSegments {
	const meetingPaths = new Set(rollup.meetings.map((m) => m.file.path));
	const openTaskPaths = new Set(
		rollup.tasks
			.filter((t) => !doneTask.has(t.status) && !t.completedDate?.trim())
			.map((t) => t.file.path),
	);
	const rows: NextUpSortRow[] = [];
	for (const n of rollup.atomicNotes) {
		if (meetingPaths.has(n.file.path)) continue;
		if (atomicNoteExcludedFromProjectNextUp(n, openTaskPaths, taskTag)) continue;
		if (n.endTime?.trim()) continue;
		if (!isISODateTodayOrFuture(n.dateSort)) continue;
		rows.push({key: n.dateSort.slice(0, 10), kind: "note", note: n});
	}
	for (const m of rollup.meetings) {
		const key = meetingNextUpKey(m);
		if (key == null) continue;
		rows.push({key, kind: "meeting", meeting: m});
	}
	rows.sort((a, b) => a.key.localeCompare(b.key));
	const sliced = rows.slice(0, limit);
	const meetings: IndexedMeeting[] = [];
	const items: NextUpItem[] = [];
	for (const r of sliced) {
		if (r.kind === "meeting") meetings.push(r.meeting);
		else if (r.kind === "task") items.push({kind: "task", task: r.task});
		else items.push({kind: "note", note: r.note});
	}
	return {meetings, items};
}

/**
 * “Next up” for an area aggregate: open tasks with due/scheduled today+ and meetings today+.
 * Same card/list split as {@link buildNextUpSegments}, without atomic notes.
 */
export function buildAreaNextUpSegments(
	tasks: IndexedTask[],
	meetings: IndexedMeeting[],
	doneTask: Set<string>,
	limit = 12,
): NextUpSegments {
	const rows: Array<
		| {key: string; kind: "task"; task: IndexedTask}
		| {key: string; kind: "meeting"; meeting: IndexedMeeting}
	> = [];
	for (const t of tasks) {
		if (doneTask.has(t.status) || t.completedDate?.trim()) continue;
		const key = earliestTodayOrFutureDueOrSched(t);
		if (key == null) continue;
		rows.push({key, kind: "task", task: t});
	}
	for (const m of meetings) {
		const key = meetingNextUpKey(m);
		if (key == null) continue;
		rows.push({key, kind: "meeting", meeting: m});
	}
	rows.sort((a, b) => a.key.localeCompare(b.key));
	const sliced = rows.slice(0, limit);
	const outMeetings: IndexedMeeting[] = [];
	const items: NextUpItem[] = [];
	for (const r of sliced) {
		if (r.kind === "meeting") outMeetings.push(r.meeting);
		else items.push({kind: "task", task: r.task});
	}
	return {meetings: outMeetings, items};
}

export function buildActivityRowModels(
	rollup: ProjectRollup,
	logEntries: ProjectLogActivityEntry[],
	deps: {
		projectPath: string;
		doneTask: Set<string>;
		openPath: (path: string) => void;
		openTask: (t: IndexedTask) => void;
		formatTracked: (n: number) => string;
	},
): ActivityRowModel[] {
	const items: ActivityRowModel[] = [];
	const meetingPaths = new Set(rollup.meetings.map((m) => m.file.path));
	for (const n of rollup.atomicNotes) {
		if (meetingPaths.has(n.file.path)) continue;
		if (atomicNoteExcludedFromActivityFeed(n)) continue;
		items.push({
			id: `note:${n.file.path}`,
			kind: "note",
			sortMs: n.modifiedMs,
			title: n.entryTitle,
			chips: appendFileModifiedChip(chipsForNote(n, deps.formatTracked), "note", n.file.stat.mtime),
			open: () => deps.openPath(n.file.path),
			hoverPath: n.file.path,
			timelineEmoji: leadingTimelineEmojiFromNoteType(n.noteType),
		});
	}
	for (const t of rollup.tasks) {
		if (completedTaskExcludedFromActivityFeed(t, deps.doneTask)) continue;
		items.push({
			id: `task:${t.file.path}:${t.line ?? 0}:${t.title.slice(0, 80)}`,
			kind: "task",
			sortMs: t.file.stat.mtime,
			title: t.title,
			chips: appendFileModifiedChip(chipsForTask(t, deps.formatTracked), "task", t.file.stat.mtime),
			open: () => deps.openTask(t),
			hoverPath: t.file.path,
		});
	}
	for (const m of rollup.meetings) {
		const meetingSort = sortMsForMeeting(m);
		if (meetingExcludedFromActivityFeedBySortMs(meetingSort)) continue;
		items.push({
			id: `meeting:${m.file.path}`,
			kind: "meeting",
			sortMs: meetingSort,
			title: m.title?.trim() || m.file.basename.replace(/\.md$/i, ""),
			chips: appendFileModifiedChip(chipsForMeeting(m, deps.formatTracked), "meeting", m.file.stat.mtime),
			open: () => deps.openPath(m.file.path),
			hoverPath: m.file.path,
		});
	}
	for (let i = 0; i < logEntries.length; i++) {
		const e = logEntries[i]!;
		if (logEntryExcludedFromActivityFeed(e.sortMs)) continue;
		items.push({
			id: `log:${e.sortMs}:${i}`,
			kind: "log",
			sortMs: e.sortMs,
			title: e.title,
			chips: chipsForLog(e),
			open: () => deps.openPath(deps.projectPath),
		});
	}
	items.sort((a, b) => b.sortMs - a.sortMs);
	return items;
}

export type ProjectActivityInput = {
	rollup: ProjectRollup;
	logEntries: ProjectLogActivityEntry[];
};

/** Weekly review grouping: meetings, tasks (created + completed), challenge notes, other notes, project-log quick notes. */
export type WeeklyReviewFacet = "meeting" | "task" | "challenge" | "note" | "log";

export type WeeklyReviewRow = ActivityRowModel & {
	reviewFacet: WeeklyReviewFacet;
};

export type WeeklyReviewMetrics = {
	meetings: number;
	notes: number;
	challenges: number;
	tasksCompleted: number;
	tasksCreated: number;
	quickNotes: number;
	trackedMinutes: number;
};

/** Percentages are shares of {@link ReviewTrackedStack.totalMinutes} (all stacks use the same total). */
export type ReviewTrackedSegment = {
	key: string;
	label: string;
	minutes: number;
	/** 0–100 */
	pct: number;
	/** Project / area stacks — resolved accent for the bar segment. */
	accentColorCss?: string;
};

export type ReviewTrackedStack = {
	totalMinutes: number;
	byProject: ReviewTrackedSegment[];
	byType: ReviewTrackedSegment[];
	byArea: ReviewTrackedSegment[];
};

export const WEEKLY_REVIEW_MAX_ROWS = 400;

export const WEEKLY_REVIEW_FACET_ORDER: {key: WeeklyReviewFacet; label: string}[] = [
	{key: "meeting", label: "Meetings"},
	{key: "task", label: "Tasks"},
	{key: "challenge", label: "Challenges"},
	{key: "note", label: "Notes"},
	{key: "log", label: "Quick notes"},
];

function atomicNoteIsChallenge(n: AtomicNoteRow): boolean {
	const type = stripWikilinks(n.noteType ?? "").toLowerCase();
	if (type.includes("challenge")) return true;
	return n.tags.some((t) => normalizeFulcrumTag(t).includes("challenge"));
}

function taskCompletionSortMs(t: IndexedTask, doneTask: Set<string>): number | null {
	if (!taskIsComplete(t, doneTask)) return null;
	if (t.completedDate?.trim()) {
		const ms = Date.parse(t.completedDate.trim().slice(0, 10) + "T12:00:00");
		if (!Number.isNaN(ms)) return ms;
	}
	return t.file.stat.mtime;
}

function chipsForTaskCreatedLine(t: IndexedTask, formatTracked: (n: number) => string): ActivityChip[] {
	const base = chipsForTask(t, formatTracked);
	return [{kind: "misc", label: "Added"}, ...base];
}

/** Feed rows must represent today or the past: nothing dated or timed from tomorrow onward (local). */
function taskActivityAnchorDayForFeed(t: IndexedTask): string | null {
	const c = t.completedDate?.trim();
	if (c && c.length >= 10) return c.slice(0, 10);
	const s = t.scheduledDate?.trim();
	if (s && s.length >= 10) return s.slice(0, 10);
	const d = t.dueDate?.trim();
	if (d && d.length >= 10) return d.slice(0, 10);
	return null;
}

function atomicNoteExcludedFromActivityFeed(n: AtomicNoteRow): boolean {
	const key = n.dateSort?.trim() ?? "";
	if (key.length >= 10) {
		const day = key.slice(0, 10);
		if (!Number.isNaN(Date.parse(day + "T12:00:00")) && isCalendarDayAfterToday(day)) return true;
	}
	return n.modifiedMs >= tomorrowMidnightLocalMs();
}

function completedTaskExcludedFromActivityFeed(t: IndexedTask, doneTask: Set<string>): boolean {
	if (!taskIsComplete(t, doneTask)) return true;
	if (t.file.stat.mtime >= tomorrowMidnightLocalMs()) return true;
	const anchor = taskActivityAnchorDayForFeed(t);
	if (anchor != null && isCalendarDayAfterToday(anchor)) return true;
	return false;
}

function completedTaskWeeklyDoneExcluded(t: IndexedTask, doneTask: Set<string>, doneMs: number): boolean {
	if (!taskIsComplete(t, doneTask)) return true;
	if (doneMs >= tomorrowMidnightLocalMs()) return true;
	const anchor = taskActivityAnchorDayForFeed(t);
	if (anchor != null && isCalendarDayAfterToday(anchor)) return true;
	return false;
}

function meetingExcludedFromActivityFeedBySortMs(sortMs: number): boolean {
	return sortMs >= tomorrowMidnightLocalMs();
}

function logEntryExcludedFromActivityFeed(sortMs: number): boolean {
	return sortMs >= tomorrowMidnightLocalMs();
}

/**
 * Richer multi-project feed for weekly review: notes (incl. challenge detection), meetings, quick-note log lines,
 * tasks **completed** in the window (by completion date / mtime) and tasks **indexed** in the window (by created time).
 */
export function buildWeeklyReviewActivityRows(
	inputs: ProjectActivityInput[],
	deps: {
		doneTask: Set<string>;
		openPath: (path: string) => void;
		openTask: (t: IndexedTask) => void;
		openProject: (path: string) => void;
		formatTracked: (n: number) => string;
		lastNDaysMs: number;
		maxRows?: number;
		/** Area file path → CSS accent (from indexed area color). */
		areaAccentByPath: Map<string, string>;
	},
): {rows: WeeklyReviewRow[]; metrics: WeeklyReviewMetrics; trackedStack: ReviewTrackedStack} {
	const items: WeeklyReviewRow[] = [];
	const cutoffMs = Date.now() - deps.lastNDaysMs;
	const maxRows = deps.maxRows ?? WEEKLY_REVIEW_MAX_ROWS;
	const metrics: WeeklyReviewMetrics = {
		meetings: 0,
		notes: 0,
		challenges: 0,
		tasksCompleted: 0,
		tasksCreated: 0,
		quickNotes: 0,
		trackedMinutes: 0,
	};
	const taskTrackedContributed = new Set<string>();
	const projectTracked = new Map<string, {minutes: number; accentColorCss: string}>();
	const areaTracked = new Map<string, {minutes: number; label: string; accentColorCss: string}>();
	const typeTracked = new Map<WeeklyReviewFacet, number>();

	function bumpAreaTracked(
		areaPathKey: string,
		areaDisplayName: string,
		areaBarAccent: string,
		minutes: number,
	): void {
		if (minutes <= 0) return;
		const key = areaPathKey || "__no_area__";
		const prev =
			areaTracked.get(key) ?? {minutes: 0, label: areaDisplayName, accentColorCss: areaBarAccent};
		prev.minutes += minutes;
		if (areaDisplayName) prev.label = areaDisplayName;
		if (areaBarAccent) prev.accentColorCss = areaBarAccent;
		areaTracked.set(key, prev);
	}

	function bumpProjectTracked(name: string, minutes: number, accent: string): void {
		if (minutes <= 0) return;
		const prev = projectTracked.get(name) ?? {minutes: 0, accentColorCss: accent};
		prev.minutes += minutes;
		if (accent) prev.accentColorCss = accent;
		projectTracked.set(name, prev);
	}

	function bumpTypeTracked(facet: WeeklyReviewFacet, minutes: number): void {
		if (minutes <= 0 || facet === "log") return;
		typeTracked.set(facet, (typeTracked.get(facet) ?? 0) + minutes);
	}

	function taskDedupeKey(t: IndexedTask): string {
		return `${t.file.path}\0${t.line ?? 0}`;
	}

	function addTaskTrackedOnce(
		t: IndexedTask,
		projectName: string,
		accentColorCss: string,
		areaPathKey: string,
		areaDisplayName: string,
		areaBarAccent: string,
	): void {
		const k = taskDedupeKey(t);
		if (taskTrackedContributed.has(k)) return;
		taskTrackedContributed.add(k);
		const m = t.trackedMinutes;
		metrics.trackedMinutes += m;
		bumpProjectTracked(projectName, m, accentColorCss);
		bumpTypeTracked("task", m);
		bumpAreaTracked(areaPathKey, areaDisplayName, areaBarAccent, m);
	}

	for (const {rollup, logEntries} of inputs) {
		const projectPath = rollup.project.file.path;
		const projectName = rollup.project.name;
		const accentColorCss = rollup.accentColorCss;
		const areaPathKey = rollup.project.areaFile?.path ?? "";
		const areaDisplayName = rollup.project.areaName?.trim() || "No area";
		const areaBarAccent =
			areaPathKey && deps.areaAccentByPath.has(areaPathKey)
				? deps.areaAccentByPath.get(areaPathKey)!
				: resolveProjectAccentCss(undefined);
		const meetingPaths = new Set(rollup.meetings.map((m) => m.file.path));

		const addProjectChip = (chips: ActivityChip[]): ActivityChip[] => {
			const out = [...chips];
			out.unshift({kind: "project", label: `+${projectName}`});
			return out;
		};

		for (const n of rollup.atomicNotes) {
			if (n.modifiedMs < cutoffMs) continue;
			if (meetingPaths.has(n.file.path)) continue;
			if (atomicNoteExcludedFromActivityFeed(n)) continue;
			const challenge = atomicNoteIsChallenge(n);
			const facet: WeeklyReviewFacet = challenge ? "challenge" : "note";
			if (challenge) metrics.challenges++;
			else metrics.notes++;
			metrics.trackedMinutes += n.trackedMinutes;
			bumpProjectTracked(projectName, n.trackedMinutes, accentColorCss);
			bumpTypeTracked(facet, n.trackedMinutes);
			bumpAreaTracked(areaPathKey, areaDisplayName, areaBarAccent, n.trackedMinutes);
			items.push({
				id: `note:${n.file.path}`,
				kind: "note",
				sortMs: n.modifiedMs,
				title: n.entryTitle,
				chips: addProjectChip(
					appendFileModifiedChip(chipsForNote(n, deps.formatTracked), "note", n.file.stat.mtime),
				),
				open: () => deps.openPath(n.file.path),
				hoverPath: n.file.path,
				timelineEmoji: leadingTimelineEmojiFromNoteType(n.noteType),
				projectName,
				accentColorCss,
				reviewFacet: facet,
			});
		}

		for (const t of rollup.tasks) {
			const doneMs = taskCompletionSortMs(t, deps.doneTask);
			if (
				doneMs != null &&
				doneMs >= cutoffMs &&
				!completedTaskWeeklyDoneExcluded(t, deps.doneTask, doneMs)
			) {
				metrics.tasksCompleted++;
				addTaskTrackedOnce(
					t,
					projectName,
					accentColorCss,
					areaPathKey,
					areaDisplayName,
					areaBarAccent,
				);
				items.push({
					id: `task-done:${t.file.path}:${t.line ?? 0}:${t.title.slice(0, 80)}`,
					kind: "task",
					sortMs: doneMs,
					title: t.title,
					chips: addProjectChip(
						appendFileModifiedChip(chipsForTask(t, deps.formatTracked), "task", t.file.stat.mtime),
					),
					open: () => deps.openTask(t),
					hoverPath: t.file.path,
					projectName,
					accentColorCss,
					reviewFacet: "task",
				});
			}
			if (t.createdAtMs >= cutoffMs && t.createdAtMs < tomorrowMidnightLocalMs()) {
				metrics.tasksCreated++;
				addTaskTrackedOnce(
					t,
					projectName,
					accentColorCss,
					areaPathKey,
					areaDisplayName,
					areaBarAccent,
				);
				const mtime = t.file.stat.mtime;
				items.push({
					id: `task-new:${t.file.path}:${t.line ?? 0}:${t.title.slice(0, 80)}`,
					kind: "task",
					sortMs: t.createdAtMs,
					title: t.title,
					chips: addProjectChip(
						appendFileModifiedChip(
							chipsForTaskCreatedLine(t, deps.formatTracked),
							"task",
							mtime,
						),
					),
					open: () => deps.openTask(t),
					hoverPath: t.file.path,
					projectName,
					accentColorCss,
					reviewFacet: "task",
				});
			}
		}

		for (const m of rollup.meetings) {
			const sortMs = sortMsForMeeting(m);
			if (sortMs < cutoffMs) continue;
			if (meetingExcludedFromActivityFeedBySortMs(sortMs)) continue;
			metrics.meetings++;
			const meetMin = meetingEffectiveMinutes(m);
			metrics.trackedMinutes += meetMin;
			bumpProjectTracked(projectName, meetMin, accentColorCss);
			bumpTypeTracked("meeting", meetMin);
			bumpAreaTracked(areaPathKey, areaDisplayName, areaBarAccent, meetMin);
			items.push({
				id: `meeting:${m.file.path}`,
				kind: "meeting",
				sortMs,
				title: m.title?.trim() || m.file.basename.replace(/\.md$/i, ""),
				chips: addProjectChip(
					appendFileModifiedChip(chipsForMeeting(m, deps.formatTracked), "meeting", m.file.stat.mtime),
				),
				open: () => deps.openPath(m.file.path),
				hoverPath: m.file.path,
				projectName,
				accentColorCss,
				reviewFacet: "meeting",
			});
		}

		for (let i = 0; i < logEntries.length; i++) {
			const e = logEntries[i]!;
			if (e.sortMs < cutoffMs) continue;
			if (logEntryExcludedFromActivityFeed(e.sortMs)) continue;
			metrics.quickNotes++;
			items.push({
				id: `log:${projectPath}:${e.sortMs}:${i}`,
				kind: "log",
				sortMs: e.sortMs,
				title: e.title,
				chips: addProjectChip(chipsForLog(e)),
				open: () => deps.openProject(projectPath),
				projectName,
				accentColorCss,
				reviewFacet: "log",
			});
		}
	}

	items.sort((a, b) => b.sortMs - a.sortMs);
	const totalMinutes = metrics.trackedMinutes;
	const pct = (m: number): number => (totalMinutes > 0 ? (m / totalMinutes) * 100 : 0);

	const byProject: ReviewTrackedSegment[] = [...projectTracked.entries()]
		.map(([name, v]) => ({
			key: name,
			label: name,
			minutes: v.minutes,
			pct: pct(v.minutes),
			accentColorCss: v.accentColorCss,
		}))
		.filter((s) => s.minutes > 0)
		.sort((a, b) => b.minutes - a.minutes);

	const typeLabels: Record<WeeklyReviewFacet, string> = {
		meeting: "Meetings",
		task: "Tasks",
		challenge: "Challenges",
		note: "Notes",
		log: "Quick notes",
	};
	const typeOrder: WeeklyReviewFacet[] = ["meeting", "task", "challenge", "note"];
	const byType: ReviewTrackedSegment[] = [];
	for (const facet of typeOrder) {
		const minutes = typeTracked.get(facet) ?? 0;
		if (minutes <= 0) continue;
		const typeAccent = ((): string => {
			switch (facet) {
				case "meeting":
					return "#a855f7";
				case "task":
					return resolveProjectAccentCss(undefined);
				case "challenge":
					return resolveProjectAccentCss("orange");
				case "note":
					return resolveProjectAccentCss("slate");
				default:
					return resolveProjectAccentCss(undefined);
			}
		})();
		byType.push({
			key: facet,
			label: typeLabels[facet],
			minutes,
			pct: pct(minutes),
			accentColorCss: typeAccent,
		});
	}

	const byArea: ReviewTrackedSegment[] = [...areaTracked.entries()]
		.map(([pathKey, v]) => ({
			key: pathKey || "__no_area__",
			label: v.label,
			minutes: v.minutes,
			pct: pct(v.minutes),
			accentColorCss: v.accentColorCss,
		}))
		.filter((s) => s.minutes > 0)
		.sort((a, b) => b.minutes - a.minutes);

	const trackedStack: ReviewTrackedStack = {
		totalMinutes,
		byProject,
		byType,
		byArea,
	};

	return {rows: items.slice(0, maxRows), metrics, trackedStack};
}

/**
 * Build activity rows from all projects, sorted by time (newest first), limited by `lastNDaysMs`.
 * Each row includes project name chip (+ProjectName) and accent color for the timeline.
 */
export function buildAggregatedActivityRows(
	inputs: ProjectActivityInput[],
	deps: {
		doneTask: Set<string>;
		openPath: (path: string) => void;
		openTask: (t: IndexedTask) => void;
		openProject: (path: string) => void;
		formatTracked: (n: number) => string;
		lastNDaysMs: number;
	},
): ActivityRowModel[] {
	const items: ActivityRowModel[] = [];
	const cutoffMs = Date.now() - deps.lastNDaysMs;

	for (const {rollup, logEntries} of inputs) {
		const projectPath = rollup.project.file.path;
		const projectName = rollup.project.name;
		const accentColorCss = rollup.accentColorCss;
		const meetingPaths = new Set(rollup.meetings.map((m) => m.file.path));

		const addProjectChip = (chips: ActivityChip[]): ActivityChip[] => {
			const out = [...chips];
			out.unshift({kind: "project", label: `+${projectName}`});
			return out;
		};

		for (const n of rollup.atomicNotes) {
			if (n.modifiedMs < cutoffMs) continue;
			if (meetingPaths.has(n.file.path)) continue;
			if (atomicNoteExcludedFromActivityFeed(n)) continue;
			items.push({
				id: `note:${n.file.path}`,
				kind: "note",
				sortMs: n.modifiedMs,
				title: n.entryTitle,
				chips: addProjectChip(
					appendFileModifiedChip(chipsForNote(n, deps.formatTracked), "note", n.file.stat.mtime),
				),
				open: () => deps.openPath(n.file.path),
				hoverPath: n.file.path,
				timelineEmoji: leadingTimelineEmojiFromNoteType(n.noteType),
				projectName,
				accentColorCss,
			});
		}
		for (const t of rollup.tasks) {
			if (completedTaskExcludedFromActivityFeed(t, deps.doneTask)) continue;
			const mtime = t.file.stat.mtime;
			if (mtime < cutoffMs) continue;
			items.push({
				id: `task:${t.file.path}:${t.line ?? 0}:${t.title.slice(0, 80)}`,
				kind: "task",
				sortMs: mtime,
				title: t.title,
				chips: addProjectChip(appendFileModifiedChip(chipsForTask(t, deps.formatTracked), "task", mtime)),
				open: () => deps.openTask(t),
				hoverPath: t.file.path,
				projectName,
				accentColorCss,
			});
		}
		for (const m of rollup.meetings) {
			const sortMs = sortMsForMeeting(m);
			if (sortMs < cutoffMs) continue;
			if (meetingExcludedFromActivityFeedBySortMs(sortMs)) continue;
			items.push({
				id: `meeting:${m.file.path}`,
				kind: "meeting",
				sortMs,
				title: m.title?.trim() || m.file.basename.replace(/\.md$/i, ""),
				chips: addProjectChip(
					appendFileModifiedChip(chipsForMeeting(m, deps.formatTracked), "meeting", m.file.stat.mtime),
				),
				open: () => deps.openPath(m.file.path),
				hoverPath: m.file.path,
				projectName,
				accentColorCss,
			});
		}
		for (let i = 0; i < logEntries.length; i++) {
			const e = logEntries[i]!;
			if (e.sortMs < cutoffMs) continue;
			if (logEntryExcludedFromActivityFeed(e.sortMs)) continue;
			items.push({
				id: `log:${projectPath}:${e.sortMs}:${i}`,
				kind: "log",
				sortMs: e.sortMs,
				title: e.title,
				chips: addProjectChip(chipsForLog(e)),
				open: () => deps.openProject(projectPath),
				projectName,
				accentColorCss,
			});
		}
	}

	items.sort((a, b) => b.sortMs - a.sortMs);
	return items;
}
