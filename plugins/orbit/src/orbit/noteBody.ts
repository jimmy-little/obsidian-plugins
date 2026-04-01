/**
 * Strip Orbit snapshot blocks so they don't appear in “live” body sections.
 * Raw note still contains them for humans and version history.
 */
export function stripOrbitSnapshotBlocks(markdown: string): string {
	const re =
		/<!--\s*orbit-snapshot(?::\d+)?\s*-->[\s\S]*?<!--\s*orbit-snapshot-end\s*-->/gi;
	return markdown.replace(re, "\n");
}

export type ParsedQuickNote = {
	rawLine: string;
	dateMs: number;
	body: string;
};

/** `- M/D/YY, h:mm AM/PM — text` (spec §2.6); em dash, en dash, or hyphen after time */
const QUICK_NOTE_LINE =
	/^\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*[\u2014\u2013\-]\s*(.*)$/im;

function parseQuickNoteLine(line: string): ParsedQuickNote | null {
	const m = line.match(QUICK_NOTE_LINE);
	if (!m) return null;
	const [, mo, da, yRaw, hh, mm, ap, rest] = m;
	let year = parseInt(yRaw, 10);
	if (year < 100) year += year >= 70 ? 1900 : 2000;
	let hour = parseInt(hh, 10);
	const isPm = ap.toUpperCase() === "PM";
	const isAm = ap.toUpperCase() === "AM";
	if (isAm && hour === 12) hour = 0;
	else if (isPm && hour !== 12) hour += 12;
	const d = new Date(year, parseInt(mo, 10) - 1, parseInt(da, 10), hour, parseInt(mm, 10), 0, 0);
	const dateMs = d.getTime();
	if (Number.isNaN(dateMs)) return null;
	return {rawLine: line, dateMs, body: rest.trim()};
}

export function extractQuickNotesFromBody(markdown: string): ParsedQuickNote[] {
	const stripped = stripOrbitSnapshotBlocks(markdown);
	const out: ParsedQuickNote[] = [];
	for (const line of stripped.split("\n")) {
		const q = parseQuickNoteLine(line);
		if (q) out.push(q);
	}
	return out;
}
