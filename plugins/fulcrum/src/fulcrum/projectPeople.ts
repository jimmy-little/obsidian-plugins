import {normalizePath, TFile, type App} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import type {AtomicNoteRow, IndexedMeeting, IndexedPerson, IndexedTask} from "./types";
import {isUnderFolder} from "./utils/paths";
import {parseWikiLink, parseWikiLinkEntry, type WikiLinkEntry} from "./utils/wikilinks";
import {resolveBannerImageSrc} from "./utils/projectVisual";

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

/** Normalize for matching `name`, `aliases`, and `alias` against wikilink text (case-fold, collapse spaces). */
export function normalizePersonMatchKey(s: string): string {
	return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function collectAliasStringsFromFmField(raw: unknown, into: string[]): void {
	if (raw == null) return;
	if (typeof raw === "string") {
		for (const part of raw.split(/[,;\n]/)) {
			const t = part.trim();
			if (t) into.push(t);
		}
		return;
	}
	if (Array.isArray(raw)) {
		for (const item of raw) {
			if (typeof item === "string" && item.trim()) into.push(item.trim());
		}
	}
}

/** Display strings that identify a people note (basename, `name`, `aliases`, `alias`). */
export function personFileMatchKeys(file: TFile, fm: Record<string, unknown> | undefined): string[] {
	const keys: string[] = [];
	const base = file.basename.replace(/\.md$/i, "");
	if (base) keys.push(base);
	if (fm && typeof fm.name === "string" && fm.name.trim()) keys.push(fm.name.trim());
	collectAliasStringsFromFmField(fm?.aliases, keys);
	collectAliasStringsFromFmField(fm?.alias, keys);
	return keys;
}

/**
 * Map normalized match keys → people note files (under `peopleFolder`).
 * Last write wins on key collision (avoid duplicate cards for alias-equivalent names).
 */
export function buildPeopleFolderMatchIndex(app: App, peopleFolder: string): Map<string, TFile> {
	const folder = normalizePath(peopleFolder.trim());
	const index = new Map<string, TFile>();
	if (!folder) return index;
	for (const f of app.vault.getMarkdownFiles()) {
		if (!isUnderFolder(f.path, folder)) continue;
		const cache = app.metadataCache.getFileCache(f);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		for (const k of personFileMatchKeys(f, fm)) {
			const nk = normalizePersonMatchKey(k);
			if (nk) index.set(nk, f);
		}
	}
	return index;
}

export type ResolvedPersonLink =
	| {kind: "known"; file: TFile; linkText: string; displayName: string}
	| {kind: "ghost"; linkText: string; displayName: string};

function displayNameFromFile(app: App, file: TFile): string {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
	if (typeof fm?.name === "string" && fm.name.trim()) return fm.name.trim();
	return file.basename.replace(/\.md$/i, "");
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
	peopleFolder: string,
	matchIndex: Map<string, TFile>,
): ResolvedPersonLink {
	const trimmed = linkText.trim();
	const displayHint = displayNameHint.trim() || trimmed;
	const folder = normalizePath(peopleFolder.trim());

	if (!folder) {
		return {kind: "ghost", linkText: trimmed, displayName: displayHint};
	}

	const dest = app.metadataCache.getFirstLinkpathDest(trimmed, sourcePath);
	if (dest instanceof TFile && isUnderFolder(dest.path, folder)) {
		return {
			kind: "known",
			file: dest,
			linkText: trimmed,
			displayName: displayNameFromFile(app, dest),
		};
	}

	const aliasHit = lookupPeopleFileByAlias(matchIndex, trimmed);
	if (aliasHit) {
		return {
			kind: "known",
			file: aliasHit,
			linkText: trimmed,
			displayName: displayNameFromFile(app, aliasHit),
		};
	}

	if (dest instanceof TFile) {
		return {kind: "ghost", linkText: trimmed, displayName: displayHint};
	}

	return {kind: "ghost", linkText: trimmed, displayName: displayHint};
}

/** Resolve link text via `name` / `aliases` / `alias` index only (normalized match). */
export function lookupPeopleFileByAlias(matchIndex: Map<string, TFile>, linkTextRaw: string): TFile | null {
	const trimmed = linkTextRaw.trim();
	if (!trimmed) return null;
	const pipe = trimmed.indexOf("|");
	const linkCore = (pipe >= 0 ? trimmed.slice(0, pipe) : trimmed).trim();
	const key = normalizePersonMatchKey(linkCore);
	if (!key) return null;
	return matchIndex.get(key) ?? null;
}

/**
 * Resolve a wikilink to a people note under `peopleFolder`: Obsidian resolution first, then alias index.
 * When `peopleFolder` is empty, returns null (use direct getFirstLinkpathDest for non-folder contexts).
 */
export function resolvePeopleFolderNote(
	app: App,
	linkTextRaw: string,
	sourcePath: string,
	peopleFolder: string,
	matchIndex: Map<string, TFile>,
): TFile | null {
	const folder = normalizePath(peopleFolder.trim());
	if (!folder) return null;
	const stripped = linkTextRaw.trim();
	if (!stripped) return null;

	const dest = app.metadataCache.getFirstLinkpathDest(stripped, sourcePath);
	if (dest instanceof TFile && isUnderFolder(dest.path, folder)) {
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
	const folder = normalizePath(s.peopleFolder.trim());
	const index =
		matchIndex ?? (folder ? buildPeopleFolderMatchIndex(app, folder) : new Map<string, TFile>());
	const avatarField = s.peopleAvatarField.trim() || "avatar";
	const bannerField = s.projectBannerField.trim() || "banner";
	const byKey = new Map<string, IndexedPerson>();

	for (const entry of entries) {
		const resolved = resolvePersonLink(
			app,
			entry.linkText,
			entry.displayName,
			sourcePath,
			folder,
			index,
		);
		if (
			opts?.skipResolvedOutsidePeopleFolder &&
			resolved.kind === "ghost" &&
			folder
		) {
			const dest = app.metadataCache.getFirstLinkpathDest(
				entry.linkText.trim(),
				sourcePath,
			);
			if (dest instanceof TFile && !isUnderFolder(dest.path, folder)) {
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
	const peopleFolder = normalizePath(s.peopleFolder.trim());
	const peopleField = s.projectRelatedPeopleField.trim() || "relatedPeople";
	const avatarField = s.peopleAvatarField.trim() || "avatar";
	const bannerField = s.projectBannerField.trim() || "banner";
	const byPath = new Map<string, IndexedPerson>();

	function addPerson(file: TFile): void {
		if (byPath.has(file.path)) return;
		byPath.set(file.path, personFromFile(app, file, avatarField, bannerField));
	}

	function addIfUnderPeopleFolder(file: TFile): void {
		if (!peopleFolder) return;
		if (isUnderFolder(file.path, peopleFolder)) addPerson(file);
	}

	const matchIndex = peopleFolder ? buildPeopleFolderMatchIndex(app, peopleFolder) : new Map<string, TFile>();

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

	if (peopleFolder) {
		async function collectFromFile(file: TFile): Promise<void> {
			try {
				const body = await app.vault.cachedRead(file);
				for (const link of extractWikilinksFromText(body)) {
					const dest = resolvePeopleFolderNote(app, link, file.path, peopleFolder, matchIndex);
					if (dest instanceof TFile) addIfUnderPeopleFolder(dest);
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
	const folder = normalizePath(s.peopleFolder.trim());
	const matchIndex = folder ? buildPeopleFolderMatchIndex(app, folder) : new Map<string, TFile>();

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
