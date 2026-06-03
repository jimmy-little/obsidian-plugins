import {normalizeIsoDateTime} from "../calendar/isoDateTime";

const DATE_TOKEN =
	/(\d{4}-\d{2}-\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/u;

function isDateToken(iso: string): boolean {
	return /^\d{4}-\d{2}-\d{2}/u.test(iso);
}

/** Title text from a markdown checkbox line, or null if not a task line. */
export function parseCheckboxLineTitle(line: string): string | null {
	const m = line.match(/^\s*[-*+]\s*\[[^\]]*\]\s*(.*)$/);
	if (!m) return null;
	return m[1]?.trim() ?? "";
}

/** Flip `[ ]` ↔ `[x]` on a checkbox line; null if not a checkbox line. */
export function flipMarkdownCheckboxLine(line: string): string | null {
	const m = line.match(/^(\s*[-*+]\s*)\[([^\]]*)\](.*)$/);
	if (!m) return null;
	const inner = m[2];
	const next = inner === " " || inner === "" ? "x" : " ";
	return `${m[1]}[${next}]${m[3]}`;
}

/**
 * Due / scheduled on a checkbox line: Obsidian Tasks emojis, Dataview `[due::]` fields,
 * and legacy ⏫ scheduled. Scheduled uses ⏳ (Tasks default) and ⏫.
 */
export function parseObsidianTasksEmojiDates(line: string): {
	title: string;
	dueDate?: string;
	scheduledDate?: string;
} {
	const dues: string[] = [];
	const sched: string[] = [];

	function pushDue(iso: string): void {
		if (isDateToken(iso)) dues.push(normalizeIsoDateTime(iso) ?? iso);
	}
	function pushSched(iso: string): void {
		if (isDateToken(iso)) sched.push(normalizeIsoDateTime(iso) ?? iso);
	}

	for (const m of line.matchAll(
		/(?:📅|⏰|📆)\s*(\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?)/gu,
	)) {
		if (m[1]) pushDue(m[1]);
	}
	for (const m of line.matchAll(
		/(?:⏳|⏫)\s*(\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?)/gu,
	)) {
		if (m[1]) pushSched(m[1]);
	}
	for (const m of line.matchAll(
		/\[due::\s*(\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?)\s*\]/giu,
	)) {
		if (m[1]) pushDue(m[1]);
	}
	for (const m of line.matchAll(
		/\[scheduled::\s*(\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?)\s*\]/giu,
	)) {
		if (m[1]) pushSched(m[1]);
	}
	for (const m of line.matchAll(
		/(?:^|[\s,])due::\s*(\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?)/giu,
	)) {
		if (m[1]) pushDue(m[1]);
	}
	for (const m of line.matchAll(
		/(?:^|[\s,])scheduled::\s*(\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?)/giu,
	)) {
		if (m[1]) pushSched(m[1]);
	}

	const dateMarker = /\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?/u;
	let t = line
		.replace(/(?:📅|⏰|📆)\s*\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?/gu, " ")
		.replace(/(?:⏳|⏫)\s*\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?/gu, " ")
		.replace(
			/\[due::\s*\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?\s*\]/giu,
			" ",
		)
		.replace(
			/\[scheduled::\s*\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?\s*\]/giu,
			" ",
		)
		.replace(
			/(?:^|[\s,])due::\s*\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?/giu,
			" ",
		)
		.replace(
			/(?:^|[\s,])scheduled::\s*\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?/giu,
			" ",
		)
		.replace(/\s+/gu, " ")
		.trim();

	return {
		title: t,
		dueDate: dues[0],
		scheduledDate: sched[0],
	};
}

/** Set checkbox checked state on a task line. */
export function setInlineTaskChecked(line: string, checked: boolean): string | null {
	const m = line.match(/^(\s*[-*+]\s*)\[([^\]]*)\](.*)$/);
	if (!m) return null;
	const mark = checked ? "x" : " ";
	return `${m[1]}[${mark}]${m[3]}`;
}

const STRIP_DUE =
	/(?:📅|⏰|📆)\s*\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?|\[due::\s*\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?\s*\]|(?:^|[\s,])due::\s*\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?/giu;
const STRIP_SCHED =
	/(?:⏳|⏫)\s*\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?|\[scheduled::\s*\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?\s*\]|(?:^|[\s,])scheduled::\s*\d{4}-\d{2}-\d{2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?)?/giu;

function formatInlineDateToken(iso: string | null): string | null {
	if (!iso) return null;
	return normalizeIsoDateTime(iso) ?? iso;
}

/** Replace or append due date emoji on a checkbox line; null due removes due markers. */
export function setInlineTaskDue(line: string, dueIso: string | null): string | null {
	const m = line.match(/^(\s*[-*+]\s*)\[([^\]]*)\](.*)$/);
	if (!m) return null;
	let rest = m[3] ?? "";
	rest = rest.replace(STRIP_DUE, " ").replace(/\s+/gu, " ").trim();
	const token = formatInlineDateToken(dueIso);
	if (token) {
		rest = rest ? `${rest} 📅 ${token}` : `📅 ${token}`;
	}
	return `${m[1]}[${m[2]}] ${rest}`.replace(/\s+$/, "");
}

/** Replace or append scheduled date emoji on a checkbox line; null removes scheduled markers. */
export function setInlineTaskScheduled(line: string, schedIso: string | null): string | null {
	const m = line.match(/^(\s*[-*+]\s*)\[([^\]]*)\](.*)$/);
	if (!m) return null;
	let rest = m[3] ?? "";
	rest = rest.replace(STRIP_SCHED, " ").replace(/\s+/gu, " ").trim();
	const token = formatInlineDateToken(schedIso);
	if (token) {
		rest = rest ? `${rest} ⏳ ${token}` : `⏳ ${token}`;
	}
	return `${m[1]}[${m[2]}] ${rest}`.replace(/\s+$/, "");
}

/** Set project wikilink on checkbox line (replaces existing project links in title portion). */
export function setInlineTaskProjectLink(
	line: string,
	projectBasename: string | null,
): string | null {
	const m = line.match(/^(\s*[-*+]\s*)\[([^\]]*)\](.*)$/);
	if (!m) return null;
	const parsed = parseObsidianTasksEmojiDates(m[3] ?? "");
	let title = parsed.title.replace(/\[\[[^\]]+\]\]/g, " ").replace(/\s+/g, " ").trim();
	if (projectBasename) {
		title = title ? `${title} [[${projectBasename}]]` : `[[${projectBasename}]]`;
	}
	const dues = parsed.dueDate ? ` 📅 ${parsed.dueDate}` : "";
	const sched = parsed.scheduledDate ? ` ⏳ ${parsed.scheduledDate}` : "";
	const body = `${title}${dues}${sched}`.trim();
	return `${m[1]}[${m[2]}] ${body}`;
}
