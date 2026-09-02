import type {App, TFile} from "obsidian";
import {addDaysIso, todayLocalISODate} from "./utils/dates";
import type {FulcrumSettings, QuickNoteTheme} from "./settingsDefaults";
import {readInlineField, resolveEntryTitle, resolveNoteType} from "./utils/notePreview";
import {toISODate} from "./utils/calendarGrid";

function fmString(fm: Record<string, unknown> | undefined, key: string): string | undefined {
	if (!fm) return undefined;
	const v = fm[key];
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return undefined;
}

function insertLogEntry(body: string, headingLine: string, entryLine: string): string {
	return appendLineUnderSectionHeading(body, headingLine, entryLine);
}

/** Append a line before the next `##` section, or create the section at EOF. */
export function appendLineUnderSectionHeading(
	body: string,
	headingLine: string,
	entryLine: string,
): string {
	const heading = headingLine.trim();
	const entry = entryLine.endsWith("\n") ? entryLine : entryLine + "\n";
	const idx = body.indexOf(heading);
	if (idx === -1) {
		const sep = body.trimEnd().length > 0 ? "\n\n" : "";
		return body.trimEnd() + `${sep}${heading}\n\n${entry}`;
	}
	const afterHeading = idx + heading.length;
	let cut = body.length;
	for (const needle of ["\n## ", "\n##\t"]) {
		const n = body.indexOf(needle, afterHeading);
		if (n !== -1) cut = Math.min(cut, n);
	}
	const headPart = body.slice(0, cut).trimEnd();
	const tailPart = body.slice(cut);
	return headPart + "\n" + entry + (tailPart.startsWith("\n") ? tailPart : "\n" + tailPart);
}

export async function appendFulcrumProjectLog(
	app: App,
	projectFile: TFile,
	headingLine: string,
	bodyLine: string,
): Promise<void> {
	const heading = headingLine.trim();
	if (!heading) throw new Error("Missing log heading");
	const body = await app.vault.read(projectFile);
	await app.vault.modify(projectFile, insertLogEntry(body, heading, bodyLine));
}

/** Non-empty log blocks under the log heading (most recent last). Each block may be multiline. */
export async function readFulcrumLogTail(
	app: App,
	projectFile: TFile,
	headingLine: string,
	maxEntries: number,
): Promise<string[]> {
	const heading = headingLine.trim();
	const body = await app.vault.read(projectFile);
	const section = extractLogSectionBody(body, heading);
	if (!section) return [];
	return splitLogSectionIntoBlocks(section).slice(-maxEntries);
}

/** Extract markdown body under the log heading (before next `##`). */
export function extractLogSectionBody(body: string, headingLine: string): string | null {
	const heading = headingLine.trim();
	const idx = body.indexOf(heading);
	if (idx === -1) return null;
	const afterHeading = body.slice(idx + heading.length);
	const nextSection = afterHeading.search(/\n##[ \t]/);
	return nextSection === -1 ? afterHeading : afterHeading.slice(0, nextSection);
}

/** Split log section into bullet blocks (top-level bullet + indented continuation lines). */
export function splitLogSectionIntoBlocks(section: string): string[] {
	const lines = section.split("\n");
	const blocks: string[] = [];
	let current: string[] = [];

	const flush = (): void => {
		if (current.length === 0) return;
		blocks.push(current.join("\n").trimEnd());
		current = [];
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			if (current.length > 0) current.push(line);
			continue;
		}
		if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
			flush();
			current.push(line);
		} else if (current.length > 0 && /^\s+/.test(line)) {
			current.push(line);
		}
	}
	flush();
	return blocks;
}

/** Wikilink target for a project note file. */
export function projectFileWikilink(app: App, projectFile: TFile): string {
	const lt =
		app.metadataCache.fileToLinktext(projectFile, projectFile.path, false) ??
		projectFile.basename.replace(/\.md$/i, "");
	return `[[${lt}]]`;
}

function formatLocalDateTime(d: Date): string {
	const y = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, "0");
	const da = String(d.getDate()).padStart(2, "0");
	const h = String(d.getHours()).padStart(2, "0");
	const mi = String(d.getMinutes()).padStart(2, "0");
	const s = String(d.getSeconds()).padStart(2, "0");
	return `${y}-${mo}-${da}T${h}:${mi}:${s}`;
}

function themeTypeValue(theme: QuickNoteTheme): string {
	return `${theme.emoji} ${theme.label}`.trim();
}

/**
 * Build a multiline quick-note block for the Fulcrum log (Dataview-compatible inline fields).
 * Always includes `projectLinkField:: [[Project]]`.
 */
export function formatQuickNoteLogBlock(params: {
	text: string;
	projectLink: string;
	projectLinkField: string;
	theme?: QuickNoteTheme | null;
	now?: Date;
}): string {
	const d = params.now ?? new Date();
	const trimmed = params.text.replace(/\s+/g, " ").trim();
	const sortMs = d.getTime();
	const stamp = d.toLocaleString(undefined, {
		dateStyle: "short",
		timeStyle: "short",
	});
	const bullet = `- <!-- fulcrum-log:${sortMs} -->${stamp} — ${trimmed}`;
	const indent = "  ";
	const fieldKey = params.projectLinkField.trim() || "project";
	const lines = [bullet];

	if (params.theme) {
		lines.push(`${indent}type:: ${themeTypeValue(params.theme)}`);
		lines.push(`${indent}entry:: ${trimmed}`);
		if (params.theme.journal?.trim()) {
			lines.push(`${indent}journal:: ${params.theme.journal.trim()}`);
		}
		lines.push(`${indent}date:: ${toISODate(d)}`);
		lines.push(`${indent}startDate:: ${formatLocalDateTime(d)}`);
	}
	lines.push(`${indent}${fieldKey}:: ${params.projectLink}`);

	return lines.join("\n");
}

export async function markProjectReviewDates(
	app: App,
	projectFile: TFile,
	s: FulcrumSettings,
): Promise<void> {
	const lr = s.projectLastReviewedField;
	const nr = s.projectNextReviewField;
	const rf = s.projectReviewFrequencyField;
	const today = todayLocalISODate();
	await app.fileManager.processFrontMatter(projectFile, (fm) => {
		const o = fm as Record<string, unknown>;
		const freqRaw = o[rf];
		let freq =
			typeof freqRaw === "number" && Number.isFinite(freqRaw)
				? Math.round(freqRaw)
				: typeof freqRaw === "string" && /^\d+$/.test(freqRaw.trim())
					? Number.parseInt(freqRaw, 10)
					: s.defaultReviewFrequencyDays;
		if (!Number.isFinite(freq) || freq < 1) freq = s.defaultReviewFrequencyDays;
		o[lr] = today;
		o[nr] = addDaysIso(today, freq);
	});
}

export function readProjectPageMeta(
	app: App,
	projectFile: TFile,
	s: FulcrumSettings,
): {
	endDate?: string;
	lastReviewed?: string;
	nextReview?: string;
	reviewFrequencyDays: number;
	jira?: string;
	description?: string;
	agentSummary?: string;
} {
	const fm = app.metadataCache.getFileCache(projectFile)?.frontmatter as
		| Record<string, unknown>
		| undefined;
	const end =
		fmString(fm, "endDate") ??
		fmString(fm, s.projectEndDateField) ??
		fmString(fm, "launchDate");
	const lastReviewed = fmString(fm, s.projectLastReviewedField);
	const nextReview = fmString(fm, s.projectNextReviewField);
	const freqRaw = fm?.[s.projectReviewFrequencyField];
	let reviewFrequencyDays = s.defaultReviewFrequencyDays;
	if (typeof freqRaw === "number" && Number.isFinite(freqRaw)) {
		reviewFrequencyDays = Math.round(freqRaw);
	} else if (typeof freqRaw === "string" && /^\d+$/.test(freqRaw.trim())) {
		reviewFrequencyDays = Number.parseInt(freqRaw, 10);
	}
	return {
		endDate: end,
		lastReviewed,
		nextReview,
		reviewFrequencyDays,
		jira: fmString(fm, s.projectJiraField),
		description: fmString(fm, "description"),
		agentSummary: fmString(fm, "agentSummary"),
	};
}

/** Parsed project log line for activity feeds (newest-first). */
export interface ProjectLogActivityEntry {
	sortMs: number;
	title: string;
	stampLabel: string;
	/** First line of the block (bullet). */
	rawLine: string;
	/** Full markdown block including indented inline fields. */
	rawBlock: string;
	noteType?: string;
	journal?: string;
}

/** One `##` section from a project note body (excluding the project log). */
export interface ProjectPageSection {
	title: string;
	/** Section body markdown (heading line omitted). */
	markdown: string;
}

function normalizeSectionHeading(heading: string): string {
	return heading.replace(/^#+\s*/, "").trim().toLowerCase();
}

/** Whether a section heading is the configured project log (or a common alias). */
export function isProjectLogSectionHeading(heading: string, configuredLogHeading: string): boolean {
	const normalized = normalizeSectionHeading(heading);
	const configured = normalizeSectionHeading(configuredLogHeading);
	if (normalized === configured) return true;
	return normalized === "project log" || normalized === "fulcrum log";
}

function stripLeadingH2(markdown: string): string {
	const lines = markdown.split("\n");
	if (lines[0]?.match(/^##[ \t]/)) {
		return lines.slice(1).join("\n").trim();
	}
	return markdown.trim();
}

/** Whether a section heading is the Fulcrum-generated project snapshot block. */
export function isProjectSnapshotSectionHeading(heading: string): boolean {
	return normalizeSectionHeading(heading).startsWith("project snapshot");
}

/** Whether a section heading is the inline checkbox task block on project notes. */
export function isProjectTasksSectionHeading(heading: string): boolean {
	return normalizeSectionHeading(heading) === "project tasks";
}

/**
 * Parse `##` sections from a project note body for the Overview tab.
 * Omits the project log section (configured heading and common aliases), Fulcrum snapshots,
 * and the Project Tasks checkbox block (rendered as task cards instead).
 */
export function parseProjectPageSections(
	body: string,
	logSectionHeading: string,
): ProjectPageSection[] {
	const trimmed = body.trim();
	if (!trimmed) return [];

	const h2Re = /^##[ \t]+(.+)$/gm;
	const matches: {index: number; title: string}[] = [];
	let m: RegExpExecArray | null;
	while ((m = h2Re.exec(trimmed)) !== null) {
		matches.push({index: m.index, title: m[1]!.trim()});
	}
	if (matches.length === 0) return [];

	const sections: ProjectPageSection[] = [];
	for (let i = 0; i < matches.length; i++) {
		const match = matches[i]!;
		if (isProjectLogSectionHeading(match.title, logSectionHeading)) continue;
		if (isProjectSnapshotSectionHeading(match.title)) continue;
		if (isProjectTasksSectionHeading(match.title)) continue;
		const start = match.index;
		const end = i + 1 < matches.length ? matches[i + 1]!.index : trimmed.length;
		const raw = trimmed.slice(start, end).trimEnd();
		const markdown = stripLeadingH2(raw);
		if (!markdown) continue;
		sections.push({title: match.title, markdown});
	}
	return sections;
}

/**
 * Append a bullet line with an HTML comment timestamp so entries sort reliably in the Activity view.
 * Human-readable stamp and message remain in the note for reading outside Fulcrum.
 */
export function formatFulcrumProjectLogLine(text: string): string {
	const trimmed = text.replace(/\s+/g, " ").trim();
	const d = new Date();
	const sortMs = d.getTime();
	const stamp = d.toLocaleString(undefined, {
		dateStyle: "short",
		timeStyle: "short",
	});
	return `- <!-- fulcrum-log:${sortMs} -->${stamp} — ${trimmed}`;
}

/** Wikilink uses the project note basename (Obsidian link target). */
export function formatProjectReviewLogMessage(
	projectBasename: string,
	optionalNote: string,
): string {
	const bn = projectBasename.replace(/\.md$/i, "");
	const link = `[[${bn}]]`;
	const note = optionalNote.replace(/\s+/g, " ").trim();
	return note.length > 0 ? `Reviewed ${link} - ${note}` : `Reviewed ${link}`;
}

function parseProjectLogLineCore(line: string): {
	sortMs: number | null;
	title: string;
	stampLabel: string;
	rawLine: string;
} | null {
	const t = line.trim();
	const newFmt = t.match(/^[-*]\s*<!--\s*fulcrum-log:(\d+)\s*-->\s*(.*)$/);
	if (newFmt?.[1] != null && newFmt[2] != null) {
		const ms = Number(newFmt[1]);
		const rest = newFmt[2].trim();
		const sep = rest.indexOf(" — ");
		if (sep === -1) {
			return {
				sortMs: Number.isFinite(ms) ? ms : null,
				title: rest || "Log entry",
				stampLabel: "",
				rawLine: line,
			};
		}
		const stampLabel = rest.slice(0, sep).trim();
		const title = rest.slice(sep + 3).trim() || stampLabel || "Log entry";
		return {
			sortMs: Number.isFinite(ms) ? ms : null,
			title,
			stampLabel,
			rawLine: line,
		};
	}
	const legacy = t.match(/^[-*]\s*(.+?)\s+—\s+(.+)$/);
	if (legacy?.[1] != null && legacy[2] != null) {
		return {
			sortMs: null,
			title: legacy[2].trim(),
			stampLabel: legacy[1].trim(),
			rawLine: line,
		};
	}
	if (/^[-*]\s*\S/.test(t)) {
		return {
			sortMs: null,
			title: t.replace(/^[-*]\s+/, "").trim(),
			stampLabel: "",
			rawLine: line,
		};
	}
	return null;
}

/**
 * Parse human-readable stamps from quick-note / legacy log lines (locale date strings, ISO snippets).
 */
function parseHumanStampToSortMs(stampLabel: string): number | null {
	const s = stampLabel.trim();
	if (!s) return null;
	const direct = Date.parse(s);
	if (!Number.isNaN(direct)) return direct;
	const iso = s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
	if (iso) {
		const t = Date.parse(iso[1]! + "T12:00:00");
		if (!Number.isNaN(t)) return t;
	}
	return null;
}

/**
 * Sort key for legacy bullets with no embedded `fulcrum-log` ms: prefer parsed inline stamp; never use
 * the project file mtime (editing the project note would reshuffle all quick notes incorrectly).
 */
function sortMsForLegacyLogLine(
	core: { sortMs: number | null; stampLabel: string; title: string },
	lineIndex: number,
): number {
	if (core.sortMs != null) return core.sortMs;
	const fromStamp = parseHumanStampToSortMs(core.stampLabel);
	if (fromStamp != null) return fromStamp;
	const fromTitle = parseHumanStampToSortMs(core.title.slice(0, 120));
	if (fromTitle != null) return fromTitle;
	/* Unparseable: stable low tier so real timestamps win; preserve file order within this tier. */
	return 978307200000 + lineIndex * 60_000;
}

/**
 * Parse log bullets; lines with `<!-- fulcrum-log:ms -->` use that instant. Legacy lines use the
 * human stamp before " — " when present, not the project note's modified time.
 * Accepts multiline blocks (bullet + indented `key:: value` lines).
 */
export function parseProjectLogLines(blocks: string[]): ProjectLogActivityEntry[] {
	const out: ProjectLogActivityEntry[] = [];
	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i]!;
		const firstLine = block.split("\n")[0] ?? block;
		const core = parseProjectLogLineCore(firstLine);
		if (!core) continue;
		const sortMs = sortMsForLegacyLogLine(core, i);
		const noteType = resolveNoteType(block, undefined);
		const journal = readInlineField(block, "journal");
		const entryInline = readInlineField(block, "entry");
		const title =
			entryInline?.trim() ||
			core.title ||
			resolveEntryTitle({
				body: block,
				fmEntry: undefined,
				basename: "Log entry",
				entryFieldKey: "entry",
			});
		out.push({
			sortMs,
			title,
			stampLabel: core.stampLabel,
			rawLine: core.rawLine,
			rawBlock: block,
			noteType: noteType || undefined,
			journal: journal || undefined,
		});
	}
	return out;
}
