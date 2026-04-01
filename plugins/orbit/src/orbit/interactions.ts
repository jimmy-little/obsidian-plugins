import type {App, CachedMetadata} from "obsidian";
import {TFile} from "obsidian";
import {extractQuickNotesFromBody} from "./noteBody";
import type {OrbitSettings} from "./settings";

export type InteractionKind = "meeting" | "call" | "note" | "quick";

export type InteractionEntry = {
	file: TFile;
	title: string;
	dateMs: number;
	kind: InteractionKind;
	/** Inline quick-note text (only when kind === "quick"). */
	quickBody?: string;
};

function fmString(meta: CachedMetadata | null | undefined, key: string): string | undefined {
	const v = meta?.frontmatter?.[key];
	return typeof v === "string" ? v : undefined;
}

function inferKind(meta: CachedMetadata | null | undefined): InteractionKind {
	const t = fmString(meta, "type")?.toLowerCase().trim();
	if (t === "meeting") return "meeting";
	if (t === "call") return "call";
	if (t === "note") return "note";
	return "note";
}

function resolveDateMs(
	file: TFile,
	meta: CachedMetadata | null | undefined,
	settings: OrbitSettings,
): number {
	const d1 = fmString(meta, settings.dateField);
	const d2 = fmString(meta, settings.startTimeField);
	for (const raw of [d1, d2]) {
		if (!raw) continue;
		const ms = Date.parse(raw);
		if (!Number.isNaN(ms)) return ms;
	}
	return file.stat.mtime;
}

/** Resolve paths of notes that link to `personPath` via `metadataCache.resolvedLinks`. */
function sourcePathsLinkingTo(app: App, personPath: string): string[] {
	const out: string[] = [];
	for (const [sourcePath, dests] of Object.entries(app.metadataCache.resolvedLinks)) {
		if (dests[personPath] && dests[personPath] > 0) out.push(sourcePath);
	}
	return out;
}

/**
 * Notes that link to `personFile` (backlinks), excluding the person's own file.
 */
export function collectInteractions(
	app: App,
	personFile: TFile,
	settings: OrbitSettings,
): InteractionEntry[] {
	const out: InteractionEntry[] = [];
	for (const linkingPath of sourcePathsLinkingTo(app, personFile.path)) {
		const f = app.vault.getAbstractFileByPath(linkingPath);
		if (!f || !(f instanceof TFile) || f.path === personFile.path) continue;
		if (f.extension !== "md") continue;

		const cache = app.metadataCache.getFileCache(f);
		const title = f.basename;
		out.push({
			file: f,
			title,
			dateMs: resolveDateMs(f, cache, settings),
			kind: inferKind(cache),
		});
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
