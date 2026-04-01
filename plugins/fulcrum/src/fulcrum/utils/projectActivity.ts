import type {ProjectLogActivityEntry} from "../projectNote";
import type {AtomicNoteRow, IndexedMeeting, IndexedTask, ProjectRollup} from "../types";
import {formatShortMonthDay, isISODateTodayOrFuture} from "./dates";
import {meetingEffectiveMinutes} from "./meetingEffectiveMinutes";

export type ChipKind = "tag" | "date" | "type" | "tracked" | "status" | "misc" | "project";

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
 * Next up: incomplete tasks (due or scheduled today+), notes (primary date today+, no `endTime`), and meetings
 * (date today+ and not already ended via `endTime` or start+duration). Atomic notes whose file is a linked meeting
 * are omitted from `items` (shown only as meeting tiles).
 * Sorted ascending by date key; capped at `limit` total rows, then split into meetings vs task/note items.
 */
export function buildNextUpSegments(
	rollup: ProjectRollup,
	doneTask: Set<string>,
	limit = 8,
): NextUpSegments {
	const meetingPaths = new Set(rollup.meetings.map((m) => m.file.path));
	const rows: NextUpSortRow[] = [];
	for (const t of rollup.tasks) {
		if (doneTask.has(t.status) || t.completedDate?.trim()) continue;
		const key = earliestTodayOrFutureDueOrSched(t);
		if (key == null) continue;
		rows.push({key, kind: "task", task: t});
	}
	for (const n of rollup.atomicNotes) {
		if (meetingPaths.has(n.file.path)) continue;
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
		items.push({
			id: `note:${n.file.path}`,
			kind: "note",
			sortMs: n.modifiedMs,
			title: n.entryTitle,
			chips: chipsForNote(n, deps.formatTracked),
			open: () => deps.openPath(n.file.path),
			hoverPath: n.file.path,
			timelineEmoji: leadingTimelineEmojiFromNoteType(n.noteType),
		});
	}
	for (const t of rollup.tasks) {
		if (!taskIsComplete(t, deps.doneTask)) continue;
		items.push({
			id: `task:${t.file.path}:${t.line ?? 0}:${t.title.slice(0, 80)}`,
			kind: "task",
			sortMs: t.file.stat.mtime,
			title: t.title,
			chips: chipsForTask(t, deps.formatTracked),
			open: () => deps.openTask(t),
			hoverPath: t.file.path,
		});
	}
	for (const m of rollup.meetings) {
		items.push({
			id: `meeting:${m.file.path}`,
			kind: "meeting",
			sortMs: sortMsForMeeting(m),
			title: m.title?.trim() || m.file.basename.replace(/\.md$/i, ""),
			chips: chipsForMeeting(m, deps.formatTracked),
			open: () => deps.openPath(m.file.path),
			hoverPath: m.file.path,
		});
	}
	for (let i = 0; i < logEntries.length; i++) {
		const e = logEntries[i]!;
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
			items.push({
				id: `note:${n.file.path}`,
				kind: "note",
				sortMs: n.modifiedMs,
				title: n.entryTitle,
				chips: addProjectChip(chipsForNote(n, deps.formatTracked)),
				open: () => deps.openPath(n.file.path),
				hoverPath: n.file.path,
				timelineEmoji: leadingTimelineEmojiFromNoteType(n.noteType),
				projectName,
				accentColorCss,
			});
		}
		for (const t of rollup.tasks) {
			if (!taskIsComplete(t, deps.doneTask)) continue;
			const mtime = t.file.stat.mtime;
			if (mtime < cutoffMs) continue;
			items.push({
				id: `task:${t.file.path}:${t.line ?? 0}:${t.title.slice(0, 80)}`,
				kind: "task",
				sortMs: mtime,
				title: t.title,
				chips: addProjectChip(chipsForTask(t, deps.formatTracked)),
				open: () => deps.openTask(t),
				hoverPath: t.file.path,
				projectName,
				accentColorCss,
			});
		}
		for (const m of rollup.meetings) {
			const sortMs = sortMsForMeeting(m);
			if (sortMs < cutoffMs) continue;
			items.push({
				id: `meeting:${m.file.path}`,
				kind: "meeting",
				sortMs,
				title: m.title?.trim() || m.file.basename.replace(/\.md$/i, ""),
				chips: addProjectChip(chipsForMeeting(m, deps.formatTracked)),
				open: () => deps.openPath(m.file.path),
				hoverPath: m.file.path,
				projectName,
				accentColorCss,
			});
		}
		for (let i = 0; i < logEntries.length; i++) {
			const e = logEntries[i]!;
			if (e.sortMs < cutoffMs) continue;
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
