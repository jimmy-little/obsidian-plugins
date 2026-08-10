import type {App} from "obsidian";
import {TFile} from "obsidian";
import type {FulcrumSettings} from "../../fulcrum/settingsDefaults";
import {parseFrontmatterDateToMs} from "../../fulcrum/utils/dates";
import {
	buildPeopleDirsMatchIndex,
	collectPeopleRefsFromLinkEntries,
	extractWikilinksFromText,
	getPersonNameAndAvatar,
	normalizePersonMatchKey,
	resolvePeopleFolderNote,
} from "../../fulcrum/projectPeople";
import {parseWikiLinkEntry, type WikiLinkEntry} from "../../fulcrum/utils/wikilinks";
import type {IndexedMeeting, IndexedPerson, PersonWorksWithEntry} from "../../fulcrum/types";
import {tryParseWhenFromBasename} from "./filenameWhen";

const TOP_COLLABORATORS = 6;
/** Only count meetings within this window toward works-with ranking. */
const LOOKBACK_MS = 18 * 30 * 24 * 60 * 60 * 1000;
/** Meetings this recent count double toward the score. */
const RECENT_BOOST_MS = 90 * 24 * 60 * 60 * 1000;

function personRefKey(person: IndexedPerson): string {
	if (person.file) return person.file.path;
	return `ghost:${normalizePersonMatchKey(person.linkText)}`;
}

function entryFromPerson(person: IndexedPerson, meetingCount: number): PersonWorksWithEntry {
	return {
		key: personRefKey(person),
		file: person.file,
		linkText: person.linkText,
		meetingCount,
	};
}

function fmValueForKey(fm: Record<string, unknown>, fieldName: string): unknown {
	const target = fieldName.trim().toLowerCase();
	for (const [k, v] of Object.entries(fm)) {
		if (k.trim().toLowerCase() === target) return v;
	}
	return undefined;
}

function pushPeopleEntriesFromFmValue(
	raw: unknown,
	pushEntry: (entry: WikiLinkEntry) => void,
): void {
	if (raw == null) return;
	if (typeof raw === "string") {
		const entry = parseWikiLinkEntry(raw);
		if (entry) pushEntry(entry);
		const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
		let m: RegExpExecArray | null;
		WIKILINK_RE.lastIndex = 0;
		while ((m = WIKILINK_RE.exec(raw)) !== null) {
			const path = m[1]?.trim();
			if (path) pushEntry({linkText: path, displayName: path});
		}
		return;
	}
	if (Array.isArray(raw)) {
		for (const item of raw) pushPeopleEntriesFromFmValue(item, pushEntry);
	}
}

/** Organizer + attendees only (not relatedPeople) for co-occurrence scoring. */
function collectMeetingFrontmatterPeople(
	app: App,
	sourcePath: string,
	fm: Record<string, unknown>,
	settings: FulcrumSettings,
	matchIndex: Map<string, TFile>,
): IndexedPerson[] {
	const organizerKey = (settings.meetingOrganizerField ?? "organizer").trim();
	const fieldNames = [...(organizerKey ? [organizerKey] : []), "attendees"];
	const orderedEntries: WikiLinkEntry[] = [];
	const seen = new Set<string>();

	function pushEntry(entry: WikiLinkEntry): void {
		const k = normalizePersonMatchKey(entry.linkText);
		if (!k || seen.has(k)) return;
		seen.add(k);
		orderedEntries.push(entry);
	}

	for (const fieldName of fieldNames) {
		pushPeopleEntriesFromFmValue(fmValueForKey(fm, fieldName), pushEntry);
	}

	return collectPeopleRefsFromLinkEntries(app, orderedEntries, sourcePath, settings, matchIndex, {
		skipResolvedOutsidePeopleFolder: true,
	});
}

/** Resolve when a meeting occurred for recency weighting. */
export function resolveMeetingDateMs(meeting: IndexedMeeting): number | null {
	if (meeting.date?.trim()) {
		const fromFm = parseFrontmatterDateToMs(meeting.date);
		if (fromFm != null) return fromFm;
	}
	const fromName = tryParseWhenFromBasename(meeting.file.basename);
	if (fromName) return fromName.ms;
	return meeting.file.stat.mtime ?? null;
}

/** Weight for a co-occurrence based on how recent the meeting was. */
export function cooccurrenceWeight(meetingMs: number, nowMs: number): number {
	const ageMs = nowMs - meetingMs;
	if (ageMs > LOOKBACK_MS) return 0;
	if (ageMs <= RECENT_BOOST_MS) return 2;
	return 1;
}

/** People in a meeting note: organizer, attendees, and body people wikilinks. */
export async function collectPeopleInMeetingNote(
	app: App,
	meetingFile: TFile,
	fm: Record<string, unknown> | undefined,
	settings: FulcrumSettings,
	matchIndex: Map<string, TFile>,
): Promise<IndexedPerson[]> {
	const byKey = new Map<string, IndexedPerson>();
	for (const person of collectMeetingFrontmatterPeople(
		app,
		meetingFile.path,
		fm ?? {},
		settings,
		matchIndex,
	)) {
		byKey.set(personRefKey(person), person);
	}

	const peopleDirs = settings.peopleDirs.map((d) => d.trim()).filter(Boolean);
	if (peopleDirs.length) {
		let body = "";
		try {
			body = await app.vault.cachedRead(meetingFile);
		} catch {
			body = "";
		}
		for (const link of extractWikilinksFromText(body)) {
			const dest = resolvePeopleFolderNote(
				app,
				link,
				meetingFile.path,
				peopleDirs,
				matchIndex,
			);
			if (!(dest instanceof TFile)) continue;
			const key = dest.path;
			if (byKey.has(key)) continue;
			const avatarField = settings.peopleAvatarField.trim() || "avatar";
			const bannerField = settings.projectBannerField.trim() || "banner";
			const {name, avatarSrc, bannerImageSrc} = getPersonNameAndAvatar(
				app,
				dest,
				avatarField,
				bannerField,
			);
			byKey.set(key, {
				file: dest,
				linkText:
					app.metadataCache.fileToLinktext(dest, meetingFile.path, true) ??
					dest.basename.replace(/\.md$/i, ""),
				name,
				avatarSrc,
				bannerImageSrc,
				isGhost: false,
			});
		}
	}

	return [...byKey.values()];
}

/**
 * Build co-occurrence map from indexed meetings: for each person, top collaborators
 * they share recent meeting notes with (organizer, attendees, body wikilinks).
 */
export async function buildPersonWorksWithIndex(
	app: App,
	meetings: IndexedMeeting[],
	settings: FulcrumSettings,
	nowMs = Date.now(),
): Promise<Map<string, PersonWorksWithEntry[]>> {
	const matchIndex = settings.peopleDirs.length
		? buildPeopleDirsMatchIndex(app, settings.peopleDirs)
		: new Map<string, TFile>();
	const counts = new Map<string, Map<string, {person: IndexedPerson; score: number}>>();

	for (const meeting of meetings) {
		const meetingMs = resolveMeetingDateMs(meeting);
		if (meetingMs == null) continue;
		const weight = cooccurrenceWeight(meetingMs, nowMs);
		if (weight <= 0) continue;

		const cache = app.metadataCache.getFileCache(meeting.file);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		const people = await collectPeopleInMeetingNote(app, meeting.file, fm, settings, matchIndex);
		if (people.length < 2) continue;

		for (let i = 0; i < people.length; i++) {
			const anchor = people[i];
			if (!anchor.file) continue;

			let anchorCounts = counts.get(anchor.file.path);
			if (!anchorCounts) {
				anchorCounts = new Map();
				counts.set(anchor.file.path, anchorCounts);
			}

			for (let j = 0; j < people.length; j++) {
				if (i === j) continue;
				const other = people[j];
				const otherKey = personRefKey(other);
				const existing = anchorCounts.get(otherKey);
				if (existing) {
					existing.score += weight;
				} else {
					anchorCounts.set(otherKey, {person: other, score: weight});
				}
			}
		}
	}

	const result = new Map<string, PersonWorksWithEntry[]>();
	for (const [anchorPath, collaboratorCounts] of counts) {
		const ranked = [...collaboratorCounts.values()]
			.sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name))
			.slice(0, TOP_COLLABORATORS)
			.map(({person, score}) => entryFromPerson(person, Math.round(score)));
		result.set(anchorPath, ranked);
	}
	return result;
}
