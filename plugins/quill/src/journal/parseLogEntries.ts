import type { TFile } from "obsidian";
import type { EntryTypeRuleShape, JournalEntry } from "./index";

export type LogParseContext = {
	dateProperty: string;
	timeProperty: string;
	entryProperty: string;
	journalProperty: string;
	entryTypes: EntryTypeRuleShape[];
	lapseKey: string | null;
	latProp: string;
	longProp: string;
};

type ParsedLogFields = {
	date: string;
	time: string;
	fields: Record<string, string>;
	rawLine: string;
};

const MONTHLY_LOG_BASENAME = /^\d{4}-\d{2}\.md$/i;
const LOG_BACKUP_PATH = /\/\d{2}-Backup\//i;

function normalizeFieldKey(key: string): string {
	return key.trim().toLowerCase();
}

/** Split log bullet segments on ` | ` while keeping inline field values intact. */
function splitLogSegments(body: string): string[] {
	return body.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
}

function parseInlineField(segment: string): { key: string; value: string } | null {
	const m = segment.match(/^([\w-]+)\s*::\s*(.*)$/);
	if (!m) return null;
	return { key: normalizeFieldKey(m[1]), value: m[2].trim() };
}

function stripWikilinks(s: string): string {
	return s.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1");
}

/** Map inline/raw type labels (e.g. "📍 Location") to configured entry type names. */
export function normalizeEntryTypeForSettings(
	rawType: string | null | undefined,
	entryTypes: EntryTypeRuleShape[],
): string | null {
	if (!rawType?.trim()) return null;
	let label = stripWikilinks(rawType).trim();
	try {
		const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
		label = [...seg.segment(label)]
			.filter((s) => !/\p{Extended_Pictographic}/u.test(s.segment))
			.map((s) => s.segment)
			.join("")
			.trim();
	} catch {
		/* keep label */
	}
	if (!label) return null;
	const lower = label.toLowerCase();
	for (const t of entryTypes) {
		if (t.name.trim().toLowerCase() === lower) return t.name;
	}
	return label;
}

function cleanEntryDisplay(raw: string): string {
	let s = stripWikilinks(raw.trim());
	s = s.replace(/^:\s*/, "");
	const quoted = s.match(/^(.+?)\s+"([^"]*)"\s*$/);
	if (quoted) return `${quoted[1].trim()} — ${quoted[2].trim()}`;
	const dashNote = s.match(/^(.+?)\s+-\s+(.+)$/);
	if (dashNote && !/^\d{4}-\d{2}-\d{2}$/.test(dashNote[1])) return dashNote[1].trim();
	return s;
}

function resolveLogEntryName(fields: Record<string, string>, entryProperty: string): string {
	const entryKey = normalizeFieldKey(entryProperty || "entry");
	const fromEntry = fields[entryKey] ?? fields.entry;
	if (fromEntry) return cleanEntryDisplay(fromEntry);
	const meal = fields.meal;
	if (meal) {
		const summary = fields.summary;
		return summary ? `${meal} — ${summary}` : meal;
	}
	const tripFrom = fields.tripfrom ?? fields["trip-from"];
	const tripTo = fields.tripto ?? fields["trip-to"];
	if (tripFrom && tripTo) return `${cleanEntryDisplay(tripFrom)} → ${cleanEntryDisplay(tripTo)}`;
	return "Log entry";
}

function resolveLogPreview(fields: Record<string, string>, rawLine: string): string {
	if (fields.summary) return fields.summary;
	if (fields.items) return fields.items;
	const entryKey = fields.entry ?? fields.meal;
	if (entryKey) return cleanEntryDisplay(entryKey);
	return rawLine.replace(/^[-*]\s*/, "").trim().slice(0, 180);
}

function parseLogBulletLine(line: string): ParsedLogFields | null {
	const trimmed = line.trim();
	if (!/^[-*]\s*\S/.test(trimmed)) return null;
	const body = trimmed.replace(/^[-*]\s*/, "").trim();
	if (!body) return null;

	const segments = splitLogSegments(body);
	if (segments.length === 0) return null;

	const fields: Record<string, string> = {};
	let date: string | null = null;

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i]!;
		if (i === 0 && /^\d{4}-\d{2}-\d{2}$/.test(segment)) {
			date = segment;
			continue;
		}
		const inline = parseInlineField(segment);
		if (inline) fields[inline.key] = inline.value;
		else if (!date) {
			const embedded = segment.match(/\b(\d{4}-\d{2}-\d{2})\b/);
			if (embedded) date = embedded[1]!;
		}
	}

  if (!date) {
    const fromField = fields.date;
    if (fromField && /^\d{4}-\d{2}-\d{2}/.test(fromField)) date = fromField.slice(0, 10);
  }
	if (!date) return null;

	return { date, time: "", fields, rawLine: trimmed };
}

function resolveLogTime(
	fields: Record<string, string>,
	timeProperty: string,
): string {
	const keys = [
		normalizeFieldKey(timeProperty || "time"),
		"starttime",
		"time",
	];
	for (const k of keys) {
		const raw = fields[k];
		if (!raw) continue;
		const t = raw.trim();
		const hms = t.match(/(\d{2}:\d{2}(?::\d{2})?)/);
		if (hms) return hms[1]!.slice(0, 5);
	}
	return "";
}

function isOutsideCodeFence(lineIndex: number, fenceRanges: Array<[number, number]>): boolean {
	for (const [start, end] of fenceRanges) {
		if (lineIndex >= start && lineIndex <= end) return false;
	}
	return true;
}

function codeFenceRanges(lines: string[]): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	let start = -1;
	for (let i = 0; i < lines.length; i++) {
		if (/^```/.test(lines[i]!.trim())) {
			if (start === -1) start = i;
			else {
				ranges.push([start, i]);
				start = -1;
			}
		}
	}
	if (start !== -1) ranges.push([start, lines.length - 1]);
	return ranges;
}

export function isLogBackupPath(filePath: string): boolean {
	return LOG_BACKUP_PATH.test(filePath);
}

export function filePathUnderFolders(filePath: string, folders: string[]): boolean {
	const norm = filePath.replace(/^\//, "");
	return folders.some((f) => {
		const folder = f.replace(/^\//, "").replace(/\/$/, "");
		return norm === folder || norm.startsWith(folder + "/");
	});
}

/** Monthly aggregate logs (check-ins, food, etc.) — not individual dated notes. */
export function shouldParseFileAsMonthlyLog(
	file: TFile,
	front: Record<string, unknown> | undefined,
	logFolderList: string[],
): boolean {
	if (logFolderList.length === 0 || !filePathUnderFolders(file.path, logFolderList)) return false;
	if (isLogBackupPath(file.path)) return false;

	const typeRaw = front?.type;
	const typeStr = typeof typeRaw === "string" ? typeRaw.trim().toLowerCase() : "";
	if (typeStr.endsWith("-log") || typeStr.includes("-log")) return true;
	if (MONTHLY_LOG_BASENAME.test(file.basename)) return true;
	return false;
}

export function journalEntryKey(entry: Pick<JournalEntry, "file" | "sourceLine">): string {
	if (entry.sourceLine != null) return `${entry.file.path}#L${entry.sourceLine}`;
	return entry.file.path;
}

export function parseLogFileToEntries(
	file: TFile,
	content: string,
	front: Record<string, unknown> | undefined,
	ctx: LogParseContext,
	classifyEntryType: (
		filePath: string,
		front: Record<string, unknown> | undefined,
		types: EntryTypeRuleShape[],
		dateKey: string,
	) => string | null,
): JournalEntry[] {
	const lines = content.split("\n");
	const fences = codeFenceRanges(lines);
	const defaultJournal =
		typeof front?.[ctx.journalProperty] === "string"
			? stripWikilinks(String(front[ctx.journalProperty]).trim())
			: "";
	const out: JournalEntry[] = [];

	for (let i = 0; i < lines.length; i++) {
		if (!isOutsideCodeFence(i, fences)) continue;
		const parsed = parseLogBulletLine(lines[i]!);
		if (!parsed) continue;

		const { date, fields, rawLine } = parsed;
		const time = resolveLogTime(fields, ctx.timeProperty);
		const journalRaw = fields[normalizeFieldKey(ctx.journalProperty)] ?? fields.journal ?? defaultJournal;
		const journal = stripWikilinks(journalRaw.trim());
		const name = resolveLogEntryName(fields, ctx.entryProperty);
		const preview = resolveLogPreview(fields, rawLine);

		const syntheticFront: Record<string, unknown> = { ...fields };
		if (fields.type) syntheticFront.type = fields.type;
		if (journal) syntheticFront[ctx.journalProperty] = journal;

		const inlineType = fields.type ? stripWikilinks(fields.type) : null;
		const classified = classifyEntryType(file.path, syntheticFront, ctx.entryTypes, date);
		const entryType =
			classified ??
			normalizeEntryTypeForSettings(inlineType, ctx.entryTypes) ??
			inlineType;

		const tags: string[] = [];
		const tagsRaw = fields.tags;
		if (tagsRaw) {
			for (const t of tagsRaw.split(/[\s,#]+/)) {
				const n = t.replace(/^#+/, "").trim();
				if (n) tags.push(n);
			}
		}

		out.push({
			file,
			date,
			time,
			name,
			preview,
			journal,
			firstImagePath: null,
			coverImagePath: null,
			imagePaths: [],
			entryType,
			hasLapseEntries: false,
			isMedia: false,
			showTitle: null,
			season: null,
			episode: null,
			latitude: null,
			longitude: null,
			tags,
			sourceLine: i,
			logLineText: rawLine,
			fromLogFile: true,
		});
	}

	return out;
}
