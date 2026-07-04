import {normalizePath, TFile, type App} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import type {AtomicNoteRow, IndexedMeeting, IndexedPerson, IndexedTask} from "./types";
import {isUnderFolder} from "./utils/paths";
import {parseWikiLink, parseWikiLinkEntry, type WikiLinkEntry} from "./utils/wikilinks";
import {resolveBannerImageSrc} from "./utils/projectVisual";
import {
	buildPeopleDirsMatchIndex,
	lookupPeopleFileByAlias,
	normalizePersonMatchKey,
	personFileMatchKeys,
	resolvePersonLinkInDirs,
	type ResolvedPersonLink,
} from "./people/resolve";
import {isFileInPeopleDirs} from "./people/pathUtils";

export {
	buildPeopleDirsMatchIndex,
	buildPeopleFolderMatchIndex,
	lookupPeopleFileByAlias,
	normalizePersonMatchKey,
	personFileMatchKeys,
	type ResolvedPersonLink,
} from "./people/resolve";

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

/** Extract `[[links]]` from a string (for scanning frontmatter values). */
export function extractWikilinksFromText(text: string): string[] {
	const out: string[] = [];
	let m: RegExpExecArray | null;
	WIKILINK_RE.lastIndex = 0;
	while ((m = WIKILINK_RE.exec(text)) !== null) {
		const path = m[1]?.trim();
		if (path) out.push(path);
	}
	return out;
}

function effectivePeopleDirs(s: FulcrumSettings): string[] {
	return s.peopleDirs.map((d) => d.trim()).filter(Boolean);
}

/**
 * Resolve a wikilink to a people-folder note or a ghost reference.
 * Ghost: unresolved link, or resolved note outside the configured people folder.
 */
export function resolvePersonLink(
	app: App,
	linkText: string,
	displayNameHint: string,
	sourcePath: string,
	peopleDirs: string[],
	matchIndex: Map<string, TFile>,
): ResolvedPersonLink {
	return resolvePersonLinkInDirs(app, linkText, displayNameHint, sourcePath, peopleDirs, matchIndex);
}

/**
 * Resolve a wikilink to a people note under `peopleFolder`: Obsidian resolution first, then alias index.
 * When `peopleFolder` is empty, returns null (use direct getFirstLinkpathDest for non-folder contexts).
 */
export function resolvePeopleFolderNote(
	app: App,
	linkTextRaw: string,
	sourcePath: string,
	peopleDirs: string[],
	matchIndex: Map<string, TFile>,
): TFile | null {
	if (!peopleDirs.length) return null;
	const stripped = linkTextRaw.trim();
	if (!stripped) return null;

	const dest = app.metadataCache.getFirstLinkpathDest(stripped, sourcePath);
	if (dest instanceof TFile && isFileInPeopleDirs(dest.path, peopleDirs)) {
		return dest;
	}

	return lookupPeopleFileByAlias(matchIndex, stripped);
}

function extractWikiLinkEntriesFromFmValue(raw: unknown): WikiLinkEntry[] {
	const out: WikiLinkEntry[] = [];
	if (typeof raw === "string") {
		const entry = parseWikiLinkEntry(raw);
		if (entry) out.push(entry);
	} else if (Array.isArray(raw)) {
		for (const item of raw) {
			const entry = parseWikiLinkEntry(item);
			if (entry) out.push(entry);
		}
	}
	return out;
}

function personRefKey(person: IndexedPerson): string {
	if (person.file) return person.file.path;
	return `ghost:${normalizePersonMatchKey(person.linkText)}`;
}

function indexedPersonFromResolved(
	app: App,
	resolved: ResolvedPersonLink,
	avatarField: string,
	bannerField: string,
): IndexedPerson {
	if (resolved.kind === "known") {
		const {name, avatarSrc, bannerImageSrc} = getPersonNameAndAvatar(
			app,
			resolved.file,
			avatarField,
			bannerField,
		);
		return {
			file: resolved.file,
			linkText: resolved.linkText,
			name,
			avatarSrc,
			bannerImageSrc,
			isGhost: false,
		};
	}
	return {
		file: null,
		linkText: resolved.linkText,
		name: resolved.displayName,
		avatarSrc: null,
		bannerImageSrc: null,
		isGhost: true,
	};
}

function addPersonRef(byKey: Map<string, IndexedPerson>, person: IndexedPerson): void {
	const key = personRefKey(person);
	if (byKey.has(key)) return;
	byKey.set(key, person);
}

type CollectPeopleRefsOptions = {
	/** When scanning broad frontmatter, skip wikilinks that resolve to notes outside `peopleFolder`. */
	skipResolvedOutsidePeopleFolder?: boolean;
};

/** Resolve wikilink entries to known or ghost person refs (deduped, preserves order). */
export function collectPeopleRefsFromLinkEntries(
	app: App,
	entries: WikiLinkEntry[],
	sourcePath: string,
	s: FulcrumSettings,
	matchIndex?: Map<string, TFile>,
	opts?: CollectPeopleRefsOptions,
): IndexedPerson[] {
	const peopleDirs = effectivePeopleDirs(s);
	const index =
		matchIndex ?? (peopleDirs.length ? buildPeopleDirsMatchIndex(app, peopleDirs) : new Map<string, TFile>());
	const avatarField = s.peopleAvatarField.trim() || "avatar";
	const bannerField = s.projectBannerField.trim() || "banner";
	const byKey = new Map<string, IndexedPerson>();

	for (const entry of entries) {
		const resolved = resolvePersonLink(
			app,
			entry.linkText,
			entry.displayName,
			sourcePath,
			peopleDirs,
			index,
		);
		if (
			opts?.skipResolvedOutsidePeopleFolder &&
			resolved.kind === "ghost" &&
			peopleDirs.length
		) {
			const dest = app.metadataCache.getFirstLinkpathDest(
				entry.linkText.trim(),
				sourcePath,
			);
			if (dest instanceof TFile && !isFileInPeopleDirs(dest.path, peopleDirs)) {
				continue;
			}
		}
		addPersonRef(byKey, indexedPersonFromResolved(app, resolved, avatarField, bannerField));
	}

	return [...byKey.values()];
}

function parsePeopleRefsFromFrontmatter(
	app: App,
	sourcePath: string,
	fm: Record<string, unknown> | undefined,
	field: string,
	s: FulcrumSettings,
	matchIndex: Map<string, TFile>,
): IndexedPerson[] {
	if (!fm) return [];
	const entries = extractWikiLinkEntriesFromFmValue(fm[field]);
	return collectPeopleRefsFromLinkEntries(app, entries, sourcePath, s, matchIndex);
}

/** Display name and avatar for a people note (frontmatter `name`, else basename). */
export function getPersonNameAndAvatar(
	app: App,
	file: TFile,
	avatarField: string,
	bannerField?: string,
): {name: string; avatarSrc: string | null; bannerImageSrc: string | null} {
	const cache = app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter as Record<string, unknown> | undefined;
	const name =
		(typeof fm?.name === "string" && fm.name.trim()) ||
		file.basename.replace(/\.md$/i, "");
	const avatarRaw = fm && avatarField ? (fm[avatarField] as string | undefined) : undefined;
	const avatarSrc = resolveBannerImageSrc(app, file, avatarRaw);
	const bannerKey = bannerField?.trim();
	const bannerRaw = bannerKey && fm ? (fm[bannerKey] as string | undefined) : undefined;
	const bannerImageSrc = bannerKey ? resolveBannerImageSrc(app, file, bannerRaw) : null;
	return {name, avatarSrc, bannerImageSrc};
}

function personFromFile(app: App, file: TFile, avatarField: string, bannerField: string): IndexedPerson {
	const {name, avatarSrc, bannerImageSrc} = getPersonNameAndAvatar(app, file, avatarField, bannerField);
	const linkText =
		app.metadataCache.fileToLinktext(file, "", true) ?? file.basename.replace(/\.md$/i, "");
	return {
		file,
		linkText,
		name,
		avatarSrc,
		bannerImageSrc,
		isGhost: false,
	};
}

/**
 * Collect related people: from project frontmatter (always) and from linked notes/tasks
 * (only when peopleFolder is set). Dedupes by path and sorts by name.
 */
export async function collectRelatedPeople(
	app: App,
	projectPath: string,
	projectFile: TFile,
	tasks: IndexedTask[],
	meetings: IndexedMeeting[],
	atomicNotes: AtomicNoteRow[],
	s: FulcrumSettings,
): Promise<IndexedPerson[]> {
	const peopleDirs = effectivePeopleDirs(s);
	const peopleField = s.projectRelatedPeopleField.trim() || "relatedPeople";
	const avatarField = s.peopleAvatarField.trim() || "avatar";
	const bannerField = s.projectBannerField.trim() || "banner";
	const byPath = new Map<string, IndexedPerson>();

	function addPerson(file: TFile): void {
		if (byPath.has(file.path)) return;
		byPath.set(file.path, personFromFile(app, file, avatarField, bannerField));
	}

	function addIfUnderPeopleDirs(file: TFile): void {
		if (!peopleDirs.length) return;
		if (isFileInPeopleDirs(file.path, peopleDirs)) addPerson(file);
	}

	const matchIndex = peopleDirs.length
		? buildPeopleDirsMatchIndex(app, peopleDirs)
		: new Map<string, TFile>();

	const projectCache = app.metadataCache.getFileCache(projectFile);
	const projectFm = projectCache?.frontmatter as Record<string, unknown> | undefined;
	for (const person of parsePeopleRefsFromFrontmatter(
		app,
		projectPath,
		projectFm,
		peopleField,
		s,
		matchIndex,
	)) {
		byPath.set(personRefKey(person), person);
	}

	if (peopleDirs.length) {
		async function collectFromFile(file: TFile): Promise<void> {
			try {
				const body = await app.vault.cachedRead(file);
				for (const link of extractWikilinksFromText(body)) {
					const dest = resolvePeopleFolderNote(app, link, file.path, peopleDirs, matchIndex);
					if (dest instanceof TFile) addIfUnderPeopleDirs(dest);
				}
			} catch {
				// ignore
			}
		}
		for (const t of tasks) {
			await collectFromFile(t.file);
		}
		for (const m of meetings) {
			await collectFromFile(m.file);
		}
		for (const n of atomicNotes) {
			await collectFromFile(n.file);
		}
		await collectFromFile(projectFile);
	}

	const people = [...byPath.values()];
	people.sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"}));
	return people;
}

const PEOPLE_FRONTMATTER_FIELDS = ["attendees"] as const;

function fmValueForKey(fm: Record<string, unknown>, fieldName: string): unknown {
	const target = fieldName.trim().toLowerCase();
	for (const [k, v] of Object.entries(fm)) {
		if (k.trim().toLowerCase() === target) return v;
	}
	return undefined;
}

function pushPeopleEntriesFromFmValue(raw: unknown, pushEntry: (entry: WikiLinkEntry) => void): void {
	if (raw == null) return;
	if (typeof raw === "string") {
		for (const entry of extractWikiLinkEntriesFromFmValue(raw)) {
			pushEntry(entry);
		}
		for (const link of extractWikilinksFromText(raw)) {
			pushEntry({linkText: link, displayName: link});
		}
		return;
	}
	if (Array.isArray(raw)) {
		for (const item of raw) {
			pushPeopleEntriesFromFmValue(item, pushEntry);
		}
	}
}

/**
 * People wikilinks from people-related frontmatter only (`organizer`, `attendees`, `relatedPeople`).
 * Includes ghost refs when the note file does not exist under `peopleFolder`.
 */
export function collectPeopleRefsFromNoteFrontmatter(
	app: App,
	sourcePath: string,
	fm: Record<string, unknown>,
	s: FulcrumSettings,
): IndexedPerson[] {
	const peopleDirs = effectivePeopleDirs(s);
	const matchIndex = peopleDirs.length
		? buildPeopleDirsMatchIndex(app, peopleDirs)
		: new Map<string, TFile>();

	const organizerKey = (s.meetingOrganizerField ?? "organizer").trim();
	const relatedKey = s.projectRelatedPeopleField.trim() || "relatedPeople";
	const fieldNames = [
		...(organizerKey ? [organizerKey] : []),
		...PEOPLE_FRONTMATTER_FIELDS,
		relatedKey,
	];

	const orderedEntries: WikiLinkEntry[] = [];
	const seenLinkKeys = new Set<string>();

	function pushEntry(entry: WikiLinkEntry): void {
		const k = normalizePersonMatchKey(entry.linkText);
		if (!k || seenLinkKeys.has(k)) return;
		seenLinkKeys.add(k);
		orderedEntries.push(entry);
	}

	for (const fieldName of fieldNames) {
		pushPeopleEntriesFromFmValue(fmValueForKey(fm, fieldName), pushEntry);
	}

	return collectPeopleRefsFromLinkEntries(app, orderedEntries, sourcePath, s, matchIndex, {
		skipResolvedOutsidePeopleFolder: true,
	});
}
