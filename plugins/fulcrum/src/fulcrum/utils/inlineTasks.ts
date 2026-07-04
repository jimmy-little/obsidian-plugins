import type {App, TFile} from "obsidian";
import {MarkdownView} from "obsidian";
import type {FulcrumSettings} from "../settingsDefaults";
import {normalizeIsoDateTime} from "../calendar/isoDateTime";
import {
	fileMatchesFolderScopeWithExcludes,
	parseFolderScopeList,
} from "./folderScopes";
import {
	formatInlineProjectLink,
	INLINE_PROJECT_LINK_RE,
	stripInlineProjectLinks,
} from "./projectLink";

const DATE_TOKEN =
	/(\d{4}-\d{2}-\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/u;

function isDateToken(iso: string): boolean {
	return /^\d{4}-\d{2}-\d{2}/u.test(iso);
}

const PRIORITY_EMOJI: Record<string, string> = {
	"⏫": "high",
	"🔼": "high",
	"🔽": "low",
	"⏬": "low",
};

/** Whether a markdown line is a task checkbox (`- [ ]`, `* [x]`, etc.). */
export function isCheckboxLine(line: string): boolean {
	return /^\s*[-*+]\s*\[[^\]]*\]/.test(line);
}

/** Metadata or active cursor indicates checkbox task lines worth live-preview work. */
export function fileHasTaskCheckboxContent(app: App, file: TFile): boolean {
	const cache = app.metadataCache.getFileCache(file);
	if (cache?.listItems?.some((item) => item.task !== undefined)) return true;

	const leaf = app.workspace.activeLeaf;
	const view = leaf?.view;
	if (
		view instanceof MarkdownView &&
		view.file?.path === file.path &&
		view.getMode() !== "preview"
	) {
		const editor = view.editor;
		if (isCheckboxLine(editor.getLine(editor.getCursor().line))) return true;
	}
	return false;
}

/** Whether inline-task autocomplete / indexing folder scope includes this file. */
export function isInlineTaskLineInScope(filePath: string, settings: FulcrumSettings): boolean {
	const scope = parseFolderScopeList(settings.obsidianTasksFolderPaths);
	return fileMatchesFolderScopeWithExcludes(
		filePath,
		scope.include,
		scope.exclude,
		scope.excludeFilenames,
	);
}

/** Plain title text from a checkbox line (no tags, links, dates, or priority emoji). */
export function inlineTaskPlainTitle(rawLine: string): string {
	const titleBare = parseCheckboxLineTitle(rawLine);
	if (titleBare === null) return "";
	const parsed = parseObsidianTasksEmojiDates(titleBare);
	const withoutProject = stripInlineProjectLinks(parsed.title);
	return stripInlineTagsForTitle(withoutProject.replace(/\[\[[^\]]+\]\]/g, " "))
		.replace(/\s+/g, " ")
		.trim();
}

/** Whether the checkbox on `rawLine` is checked. */
export function isInlineTaskLineChecked(rawLine: string): boolean {
	return /^\s*[-*+]\s*\[[xX]\]/.test(rawLine);
}

/** Replace inline metadata with checkbox + wikilink only (TaskNotes-style). */
export function replaceInlineTaskWithWikilink(
	line: string,
	noteBasename: string,
	checked: boolean,
): string | null {
	const m = line.match(/^(\s*[-*+]\s*)\[([^\]]*)\](.*)$/);
	if (!m) return null;
	const mark = checked ? "x" : " ";
	const safeName = noteBasename.replace(/\]\]/g, "");
	return `${m[1]}[${mark}] [[${safeName}]]`;
}

/** True when checkbox body is only wikilink(s) — TaskNotes embed `- [ ] [[Task note]]`. */
export function isTaskNoteEmbedBareTitle(bare: string): boolean {
	if (!/\[\[[^\]]+\]\]/u.test(bare)) return false;
	const withoutLinks = bare.replace(/\[\[[^\]]+\]\]/gu, " ").replace(/\s+/g, " ").trim();
	if (!withoutLinks) return true;
	const parsed = parseObsidianTasksEmojiDates(withoutLinks);
	return stripInlineTagsForTitle(parsed.title).trim() === "";
}

/** Extract `#tag` tokens from task line text. */
export function parseInlineTags(text: string): string[] {
	const tags: string[] = [];
	const re = /(?:^|[\s(])#([\w-]+)/gu;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		const t = m[1]?.trim();
		if (t) tags.push(t);
	}
	return [...new Set(tags)];
}

export function lineIncludesTag(text: string, tag: string): boolean {
	if (!tag.trim()) return true;
	const want = tag.trim().toLowerCase().replace(/^#/, "");
	return parseInlineTags(text).some((t) => t.toLowerCase() === want);
}

/** Parse Tasks-plugin priority emoji from line. */
export function parseInlinePriority(text: string): string | undefined {
	for (const [emoji, pri] of Object.entries(PRIORITY_EMOJI)) {
		if (text.includes(emoji)) return pri;
	}
	return undefined;
}

export function stripInlineTagsForTitle(text: string): string {
	return text.replace(/(?:^|[\s(])#[\w-]+/gu, " ").replace(/\s+/g, " ").trim();
}

/** Replace page `[[links]]` with visible text; does not affect `+[[project]]` (strip those first). */
export function wikilinksToDisplayText(text: string): string {
	return text.replace(/\[\[([^\]]+)\]\]/gu, (_, inner: string) => {
		const pathPart = inner.split("#")[0] ?? inner;
		const pipe = pathPart.split("|");
		return (pipe.length > 1 ? pipe[pipe.length - 1] : pipe[0])?.trim() ?? inner;
	});
}

/** Human-readable title for inline task cards (strip project link + tags; keep page link text). */
export function inlineTaskDisplayTitle(title: string): string {
	const parsed = parseObsidianTasksEmojiDates(title);
	const withoutProject = stripInlineProjectLinks(parsed.title);
	const withLinkText = wikilinksToDisplayText(withoutProject);
	const cleaned = stripInlineTagsForTitle(withLinkText);
	return cleaned.replace(/\s+/g, " ").trim() || "Task";
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

/** Set `+[[project]]` on checkbox line; preserves page wikilinks in the title. */
export function setInlineTaskProjectLink(
	line: string,
	projectBasename: string | null,
): string | null {
	const m = line.match(/^(\s*[-*+]\s*)\[([^\]]*)\](.*)$/);
	if (!m) return null;
	const parsed = parseObsidianTasksEmojiDates(m[3] ?? "");
	let title = stripInlineProjectLinks(parsed.title);
	if (projectBasename) {
		const projectToken = formatInlineProjectLink(projectBasename);
		title = title ? `${title} ${projectToken}` : projectToken;
	}
	const dues = parsed.dueDate ? ` 📅 ${parsed.dueDate}` : "";
	const sched = parsed.scheduledDate ? ` ⏳ ${parsed.scheduledDate}` : "";
	const body = `${title}${dues}${sched}`.trim();
	return `${m[1]}[${m[2]}] ${body}`;
}

function extractWikiLinks(text: string): string[] {
	const withoutProject = text.replace(INLINE_PROJECT_LINK_RE, " ");
	return [...withoutProject.matchAll(/\[\[[^\]]+\]\]/gu)].map((m) => m[0] ?? "").filter(Boolean);
}

function extractInlineProjectLinks(text: string): string[] {
	return [...text.matchAll(INLINE_PROJECT_LINK_RE)].map((m) => m[0] ?? "").filter(Boolean);
}

/** Replace visible title text; preserves wikilinks, inline tags, and date tokens. */
export function setInlineTaskTitle(line: string, newTitle: string): string | null {
	const m = line.match(/^(\s*[-*+]\s*)\[([^\]]*)\](.*)$/);
	if (!m) return null;
	const parsed = parseObsidianTasksEmojiDates(m[3] ?? "");
	const projectLinks = extractInlineProjectLinks(parsed.title);
	const links = extractWikiLinks(parsed.title);
	const tags = parseInlineTags(parsed.title);
	const title = newTitle.trim();
	let body = title;
	if (links.length) body = `${body} ${links.join(" ")}`.trim();
	if (projectLinks.length) body = `${body} ${projectLinks.join(" ")}`.trim();
	if (tags.length) body = `${body} ${tags.map((t) => `#${t}`).join(" ")}`.trim();
	const dues = parsed.dueDate ? ` 📅 ${parsed.dueDate}` : "";
	const sched = parsed.scheduledDate ? ` ⏳ ${parsed.scheduledDate}` : "";
	return `${m[1]}[${m[2]}] ${body}${dues}${sched}`.replace(/\s+$/, "");
}

/** Replace `#tag` tokens on the checkbox line; preserves title, links, and dates. */
export function setInlineTaskTags(line: string, tags: string[]): string | null {
	const m = line.match(/^(\s*[-*+]\s*)\[([^\]]*)\](.*)$/);
	if (!m) return null;
	const parsed = parseObsidianTasksEmojiDates(m[3] ?? "");
	let core = parsed.title.replace(/(?:^|[\s(])#[\w-]+/gu, " ").replace(/\s+/g, " ").trim();
	const tagPart = tags.map((t) => `#${t.replace(/^#/, "")}`).join(" ");
	if (tagPart) core = core ? `${core} ${tagPart}` : tagPart;
	const dues = parsed.dueDate ? ` 📅 ${parsed.dueDate}` : "";
	const sched = parsed.scheduledDate ? ` ⏳ ${parsed.scheduledDate}` : "";
	return `${m[1]}[${m[2]}] ${core}${dues}${sched}`.replace(/\s+$/, "");
}
