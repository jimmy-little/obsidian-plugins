import type {App, CachedMetadata, Pos, TFile} from "obsidian";
import {
	createDailyNote,
	getAllDailyNotes,
	getDateFromFile,
	getDailyNote,
} from "obsidian-daily-notes-interface";
import moment from "moment";
import type {FulcrumSettings} from "../settingsDefaults";
import type {IndexedPlannerEvent} from "../types";
import {todayLocalISODate} from "./dates";
import {parseCheckboxLineTitle} from "./inlineTasks";
import {minutesToHHmm, parseTimeRangeFromLine, stripTimeRangeFromTitle} from "./dayPlannerTime";

/** Default label for new planner lines and empty parsed titles. */
export const DEFAULT_PLANNER_BLOCK_TITLE = "Time block";

type PartialPos = {start: Pos["start"]; end?: Pos["start"]};

function isInside(inner: Pos, outer: PartialPos): boolean {
	const innerStartInside = inner.start.offset >= outer.start.offset;
	if (!outer.end) return innerStartInside;
	return innerStartInside && inner.end.offset <= outer.end.offset;
}

function getHeadingSectionPosition(
	cache: CachedMetadata,
	headingText: string,
): PartialPos | undefined {
	const headings = cache.headings;
	if (!headings?.length || !headingText.trim()) return undefined;

	const targetIndex = headings.findIndex((h) => h.heading === headingText);
	if (targetIndex < 0) return undefined;

	const target = headings[targetIndex]!;
	const nodesAfter = headings.slice(targetIndex + 1);
	const nextBoundary = nodesAfter.find((h) => h.level <= target.level);

	return {
		start: target.position.start,
		end: nextBoundary?.position.start,
	};
}

function getTextAtPosition(inputText: string, position: Pos): string {
	return inputText.slice(position.start.offset, position.end.offset);
}

function getFirstLine(text: string): string {
	return text.split("\n")[0] ?? text;
}

function localDateIsoFromFile(_app: App, file: TFile): string | null {
	const d = getDateFromFile(file, "day");
	if (!d) return null;
	return d.format("YYYY-MM-DD");
}

function isInsideDailyNoteParseScope(
	position: Pos,
	plannerHeading: string,
	section?: PartialPos,
): boolean {
	if (!plannerHeading.trim()) return true;
	return !!(section && isInside(position, section));
}

function defaultNewTimeRange(
	focalDateIso: string,
	durationMinutes: number,
): {start: string; end: string} {
	const dur = Math.max(1, durationMinutes);
	let startMinutes = 9 * 60;
	if (focalDateIso === todayLocalISODate()) {
		const now = new Date();
		const cur = now.getHours() * 60 + now.getMinutes();
		startMinutes = Math.min(23 * 60 + 45, Math.ceil(cur / 15) * 15);
	}
	const endMinutes = Math.min(24 * 60 - 1, startMinutes + dur);
	return {start: minutesToHHmm(startMinutes), end: minutesToHHmm(endMinutes)};
}

function buildPlannerLine(start: string, end: string, title: string): string {
	return `- [ ] ${start} - ${end} ${title}`;
}

async function ensureDailyNoteForIso(app: App, dateIso: string): Promise<TFile | null> {
	const day = moment(dateIso, "YYYY-MM-DD", true);
	if (!day.isValid()) return null;
	const existing = getDailyNote(day, getAllDailyNotes());
	if (existing) return existing;
	try {
		const created = await createDailyNote(day);
		return created ?? null;
	} catch {
		return null;
	}
}

/** Append a timed planner line to the focal day's daily note (under the planner heading). */
export async function appendTimeBlockToDailyNote(
	app: App,
	settings: FulcrumSettings,
	dateIso: string,
): Promise<{file: TFile; line: number} | null> {
	if (!settings.timelineDailyPlannerEnabled) return null;

	const file = await ensureDailyNoteForIso(app, dateIso);
	if (!file) return null;

	const heading = settings.plannerHeading.trim() || "Day planner";
	const dur = Math.max(1, Math.round(settings.plannerDefaultDurationMinutes) || 30);
	const {start, end} = defaultNewTimeRange(dateIso, dur);
	const listLine = buildPlannerLine(start, end, DEFAULT_PLANNER_BLOCK_TITLE);

	let text = await app.vault.read(file);
	const headingMarkers = ["# ", "## ", "### ", "#### ", "##### ", "###### "];
	let inserted = false;

	for (const marker of headingMarkers) {
		const needle = `${marker}${heading}`;
		const idx = text.indexOf(needle);
		if (idx < 0) continue;

		const afterHeading = text.slice(idx + needle.length);
		const nextMatch = afterHeading.match(/\n#{1,6} /);
		const insertAt =
			nextMatch?.index != null
				? idx + needle.length + nextMatch.index
				: text.length;

		const before = text.slice(0, insertAt).replace(/\s*$/, "");
		const after = text.slice(insertAt);
		text = `${before}\n${listLine}\n${after.startsWith("\n") ? after : after ? `\n${after}` : ""}`;
		inserted = true;
		break;
	}

	if (!inserted) {
		text = `${text.trimEnd()}\n\n# ${heading}\n\n${listLine}\n`;
	}

	await app.vault.modify(file, text);
	const lineNo = text.split("\n").findIndex((l) => l.trim() === listLine.trim());
	return {file, line: lineNo >= 0 ? lineNo : 0};
}

/**
 * Index planner time blocks (checkbox lines) under the planner heading in each daily note.
 */
export async function indexDailyPlannerEvents(
	app: App,
	settings: FulcrumSettings,
): Promise<IndexedPlannerEvent[]> {
	if (!settings.timelineDailyPlannerEnabled) return [];

	const out: IndexedPlannerEvent[] = [];
	const heading = settings.plannerHeading.trim();
	const defaultDur = Math.max(
		1,
		Math.round(settings.plannerDefaultDurationMinutes) || 30,
	);

	const dailyNotes = getAllDailyNotes();
	const files = Object.values(dailyNotes);

	for (const file of files) {
		const dateIso = localDateIsoFromFile(app, file);
		if (!dateIso) continue;

		const cache = app.metadataCache.getFileCache(file);
		if (!cache?.listItems?.length) continue;

		const contents = await app.vault.cachedRead(file);
		const section = heading ? getHeadingSectionPosition(cache, heading) : undefined;

		for (const item of cache.listItems) {
			if (item.task === undefined) continue;
			if (
				!isInsideDailyNoteParseScope(item.position, heading, section)
			) {
				continue;
			}

			const lineNo = item.position.start.line;
			const fullText = getTextAtPosition(contents, item.position);
			const firstLine = getFirstLine(fullText);
			const titleBare = parseCheckboxLineTitle(firstLine);
			if (titleBare === null) continue;

			const time = parseTimeRangeFromLine(fullText);
			let title = time ? stripTimeRangeFromTitle(titleBare) : titleBare;
			if (!title.trim()) title = DEFAULT_PLANNER_BLOCK_TITLE;

			const isChecked = item.task === "x" || item.task === "X";
			const status = isChecked ? "done" : "todo";

			if (time) {
				out.push({
					file,
					line: lineNo,
					dateIso,
					title,
					status,
					startMinutes: time.startMinutes,
					durationMinutes: time.durationMinutes ?? defaultDur,
				});
			} else {
				out.push({
					file,
					line: lineNo,
					dateIso,
					title,
					status,
					startMinutes: null,
					durationMinutes: null,
				});
			}
		}
	}

	return out;
}

/** Planner events for a single focal day (used if snapshot not needed). */
export function plannerEventsForDate(
	events: IndexedPlannerEvent[],
	iso: string,
): IndexedPlannerEvent[] {
	return events.filter((e) => e.dateIso === iso);
}
