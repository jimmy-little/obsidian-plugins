import type {App, CachedMetadata} from "obsidian";
import {TFile} from "obsidian";
import {msFromLocalYMDDateOnlyString} from "@obsidian-suite/heatmap";
import {tryParseWhenFromBasename} from "./filenameWhen";
import {extractQuickNotesFromBody} from "./noteBody";
import {resolveWikiPath, wikiLinkPathsFromText} from "./orgLinks";
import type {OrbitSettings} from "./settings";

export type InteractionKind = "meeting" | "call" | "note" | "quick";

export type InteractionEntry = {
	file: TFile;
	title: string;
	dateMs: number;
	/** When true, show time in the feed (explicit datetime); false for date-only and mtime fallback. */
	showTimeInFeed: boolean;
	kind: InteractionKind;
	/** Raw YAML `type` (emoji + label) for timeline icon. */
	typeRaw?: string;
	/** Inline quick-note text (only when kind === "quick"). */
	quickBody?: string;
};

function fmString(meta: CachedMetadata | null | undefined, key: string): string | undefined {
	const v = meta?.frontmatter?.[key];
	return typeof v === "string" ? v : undefined;
}

function readTypeRaw(meta: CachedMetadata | null | undefined): string | undefined {
	const v = meta?.frontmatter?.type;
	if (typeof v === "string") return v;
	if (Array.isArray(v) && v.length > 0) return String(v[0]);
	return undefined;
}

/** Lowercase type keyword after optional leading emoji (e.g. 📅 Meeting). */
function typeKeyForKind(raw: string | undefined): string {
	if (!raw?.trim()) return "";
	let s = raw.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1").trimStart();
	try {
		const seg = new Intl.Segmenter(undefined, {granularity: "grapheme"});
		const first = [...seg.segment(s)][0];
		if (first && /\p{Extended_Pictographic}/u.test(first.segment)) {
			s = s.slice(first.segment.length).trimStart();
		}
	} catch {
		/* Intl.Segmenter unsupported */
	}
	return s.toLowerCase();
}

function inferKind(meta: CachedMetadata | null | undefined): InteractionKind {
	const t = typeKeyForKind(readTypeRaw(meta));
	if (t.startsWith("meeting")) return "meeting";
	if (t.startsWith("call")) return "call";
	if (t.startsWith("note")) return "note";
	return "note";
}

function fmDateTimeShowsTime(raw: string): boolean {
	return /\b\d{1,2}:\d{2}\b/.test(raw) || /T\d{2}:\d{2}/.test(raw);
}

function resolveWhen(
	file: TFile,
	meta: CachedMetadata | null | undefined,
	settings: OrbitSettings,
): {dateMs: number; showTimeInFeed: boolean} {
	const d1 = fmString(meta, settings.dateField);
	const d2 = fmString(meta, settings.startTimeField);

	if (d1?.trim()) {
		const t = d1.trim();
		const localDay = msFromLocalYMDDateOnlyString(t);
		if (localDay !== null) {
			const hasTime = fmDateTimeShowsTime(d1) || Boolean(d2?.trim());
			return {dateMs: localDay, showTimeInFeed: hasTime};
		}
		const ms = Date.parse(d1);
		if (!Number.isNaN(ms)) {
			const hasTime = fmDateTimeShowsTime(d1) || Boolean(d2?.trim());
			return {dateMs: ms, showTimeInFeed: hasTime};
		}
	}
	if (d2?.trim()) {
		const ms = Date.parse(d2);
		if (!Number.isNaN(ms)) return {dateMs: ms, showTimeInFeed: true};
	}

	const fromName = tryParseWhenFromBasename(file.basename);
	if (fromName) return {dateMs: fromName.ms, showTimeInFeed: fromName.hasTime};

	return {dateMs: file.stat.mtime, showTimeInFeed: false};
}

/** Resolve paths of notes that link to `personPath` via `metadataCache.resolvedLinks`. */
function sourcePathsLinkingTo(app: App, personPath: string): string[] {
	const out: string[] = [];
	for (const [sourcePath, dests] of Object.entries(app.metadataCache.resolvedLinks)) {
		if (dests[personPath] && dests[personPath] > 0) out.push(sourcePath);
	}
	return out;
}

function lineMentionsPerson(app: App, line: string, source: TFile, personPath: string): boolean {
	for (const lt of wikiLinkPathsFromText(line)) {
		const p = resolveWikiPath(app, lt, source);
		if (p === personPath) return true;
	}
	return false;
}

/**
 * Backlinks to `personFile`, excluding the person's own note.
 * When a linking file contains dated quick-log lines (`M/D/YY, h:mm AM/PM — …`) that wikilink
 * this person (e.g. project notes), each such line becomes its own feed row; otherwise one row
 * per backlink file as before.
 */
export async function collectInteractions(
	app: App,
	personFile: TFile,
	settings: OrbitSettings,
): Promise<InteractionEntry[]> {
	const out: InteractionEntry[] = [];
	for (const linkingPath of sourcePathsLinkingTo(app, personFile.path)) {
		const f = app.vault.getAbstractFileByPath(linkingPath);
		if (!f || !(f instanceof TFile) || f.path === personFile.path) continue;
		if (f.extension !== "md") continue;

		let body: string;
		try {
			body = await app.vault.cachedRead(f);
		} catch {
			continue;
		}

		const quickLines = extractQuickNotesFromBody(body);
		const mentionLines = quickLines.filter((q) =>
			lineMentionsPerson(app, q.rawLine, f, personFile.path),
		);

		if (mentionLines.length > 0) {
			for (const q of mentionLines) {
				out.push({
					file: f,
					title: f.basename,
					dateMs: q.dateMs,
					showTimeInFeed: true,
					kind: "quick",
					quickBody: q.body,
				});
			}
		} else {
			const cache = app.metadataCache.getFileCache(f);
			const when = resolveWhen(f, cache, settings);
			out.push({
				file: f,
				title: f.basename,
				dateMs: when.dateMs,
				showTimeInFeed: when.showTimeInFeed,
				kind: inferKind(cache),
				typeRaw: readTypeRaw(cache),
			});
		}
	}

	out.sort((a, b) => b.dateMs - a.dateMs);
	return out;
}

/** Quick notes logged on the person file (same file, distinct rows in the feed). */
export function quickNoteEntriesFromPersonBody(personFile: TFile, markdown: string): InteractionEntry[] {
	const notes = extractQuickNotesFromBody(markdown);
	return notes.map((q) => ({
		file: personFile,
		title: "Quick note",
		dateMs: q.dateMs,
		showTimeInFeed: true,
		kind: "quick" as const,
		quickBody: q.body,
	}));
}

/** Merge backlink interactions with quick notes and sort newest first. */
export function mergeActivityFeed(
	backlinkInteractions: InteractionEntry[],
	quickNotes: InteractionEntry[],
): InteractionEntry[] {
	return [...backlinkInteractions, ...quickNotes].sort((a, b) => b.dateMs - a.dateMs);
}
