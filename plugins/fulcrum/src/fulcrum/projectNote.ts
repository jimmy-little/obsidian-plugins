import type {App, TFile} from "obsidian";
import {addDaysIso, todayLocalISODate} from "./utils/dates";
import type {FulcrumSettings} from "./settingsDefaults";

function fmString(fm: Record<string, unknown> | undefined, key: string): string | undefined {
	if (!fm) return undefined;
	const v = fm[key];
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return undefined;
}

function insertLogEntry(body: string, headingLine: string, entryLine: string): string {
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

/** Non-empty bullet / numbered lines under the log heading (most recent last). */
export async function readFulcrumLogTail(
	app: App,
	projectFile: TFile,
	headingLine: string,
	maxEntries: number,
): Promise<string[]> {
	const heading = headingLine.trim();
	const body = await app.vault.read(projectFile);
	const idx = body.indexOf(heading);
	if (idx === -1) return [];
	const afterHeading = body.slice(idx + heading.length);
	const nextSection = afterHeading.search(/\n##[ \t]/);
	const section = nextSection === -1 ? afterHeading : afterHeading.slice(0, nextSection);
	const lines = section.split("\n");
	const entries: string[] = [];
	for (const line of lines) {
		const t = line.trim();
		if (/^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t)) {
			entries.push(t);
		}
	}
	return entries.slice(-maxEntries);
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
	launchDate?: string;
	lastReviewed?: string;
	nextReview?: string;
	reviewFrequencyDays: number;
	jira?: string;
	description?: string;
} {
	const fm = app.metadataCache.getFileCache(projectFile)?.frontmatter as
		| Record<string, unknown>
		| undefined;
	const launch = fmString(fm, s.projectLaunchDateField);
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
		launchDate: launch,
		lastReviewed,
		nextReview,
		reviewFrequencyDays,
		jira: fmString(fm, s.projectJiraField),
		description: fmString(fm, "description"),
	};
}

/** Parsed project log line for activity feeds (newest-first). */
export interface ProjectLogActivityEntry {
	sortMs: number;
	title: string;
	stampLabel: string;
	rawLine: string;
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
 */
export function parseProjectLogLines(lines: string[]): ProjectLogActivityEntry[] {
	const out: ProjectLogActivityEntry[] = [];
	for (let i = 0; i < lines.length; i++) {
		const core = parseProjectLogLineCore(lines[i]!);
		if (!core) continue;
		const sortMs = sortMsForLegacyLogLine(core, i);
		out.push({
			sortMs,
			title: core.title,
			stampLabel: core.stampLabel,
			rawLine: core.rawLine,
		});
	}
	return out;
}
