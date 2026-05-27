import type { JournalEntry } from "../journal";
import { formatShortMonthDay, formatShortMonthDayFromMs } from "../utils/formatDate";

export type QuillActivityChipKind =
	| "date"
	| "time"
	| "type"
	| "tag"
	| "journal"
	| "tracked"
	| "misc"
	| "fileTouch";

export type QuillActivityChip = {
	kind: QuillActivityChipKind;
	label: string;
};

function stripWikilinks(s: string): string {
	return s.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1");
}

function isMeaningfulTime(time: string | undefined): boolean {
	const t = time?.trim().slice(0, 5) ?? "";
	return t.length > 0 && t !== "00:00";
}

/** If entry type begins with an emoji, show it in the timeline circle (Fulcrum-style). */
export function leadingTimelineEmojiFromEntryType(entryType: string | undefined): string | undefined {
	if (!entryType?.trim()) return undefined;
	const display = stripWikilinks(entryType).trimStart();
	if (!display) return undefined;
	try {
		const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
		const first = [...seg.segment(display)][0];
		if (!first) return undefined;
		const g = first.segment;
		if (/\p{Extended_Pictographic}/u.test(g)) return g;
		return undefined;
	} catch {
		return undefined;
	}
}

export function buildJournalEntryChips(
	entry: JournalEntry,
	opts: { showJournal?: boolean; hideDate?: boolean; showFileModified?: boolean },
): QuillActivityChip[] {
	const chips: QuillActivityChip[] = [];

	if (!opts.hideDate) {
		const dateLabel = formatShortMonthDay(entry.date);
		if (dateLabel) chips.push({ kind: "date", label: dateLabel });
	}

	if (isMeaningfulTime(entry.time)) {
		chips.push({ kind: "time", label: entry.time.trim().slice(0, 5) });
	}

	if (entry.entryType) {
		chips.push({ kind: "type", label: stripWikilinks(entry.entryType) });
	}

	for (const tag of entry.tags) {
		chips.push({ kind: "tag", label: `#${tag}` });
	}

	if (entry.hasLapseEntries) chips.push({ kind: "tracked", label: "Timed" });

	if (opts.showJournal && entry.journal) {
		chips.push({ kind: "journal", label: entry.journal });
	}

	if (entry.isMedia && entry.showTitle) chips.push({ kind: "type", label: entry.showTitle });
	if (entry.isMedia && entry.season != null) {
		chips.push({ kind: "misc", label: `S${entry.season}` });
	}
	if (entry.isMedia && entry.episode != null) {
		chips.push({ kind: "misc", label: `E${entry.episode}` });
	}

	if (opts.showFileModified !== false) {
		const mtimeLabel = formatShortMonthDayFromMs(entry.file.stat.mtime);
		if (mtimeLabel) chips.push({ kind: "fileTouch", label: mtimeLabel });
	}

	return chips;
}
