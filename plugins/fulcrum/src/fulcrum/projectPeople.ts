import {normalizePath, TFile, type App} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import type {AtomicNoteRow, IndexedMeeting, IndexedPerson, IndexedTask} from "./types";
import {isUnderFolder} from "./utils/paths";
import {parseWikiLink} from "./utils/wikilinks";
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

function parsePeopleFromFrontmatter(
	app: App,
	sourcePath: string,
	fm: Record<string, unknown> | undefined,
	field: string,
	peopleFolder: string,
	matchIndex: Map<string, TFile>,
): TFile[] {
	if (!fm) return [];
	const raw = fm[field];
	const links: string[] = [];
	if (typeof raw === "string") {
		const p = parseWikiLink(raw);
		if (p) links.push(p);
	} else if (Array.isArray(raw)) {
		for (const item of raw) {
			const p = parseWikiLink(item);
			if (p) links.push(p);
		}
	}
	const files: TFile[] = [];
	const folderNorm = normalizePath(peopleFolder.trim());
	for (const link of links) {
		const abstract = app.metadataCache.getFirstLinkpathDest(link, sourcePath);
		let dest: TFile | null = abstract instanceof TFile ? abstract : null;
		if (!dest && folderNorm) {
			dest = lookupPeopleFileByAlias(matchIndex, link);
		}
		if (dest instanceof TFile) files.push(dest);
	}
	return files;
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
	return {file, name, avatarSrc, bannerImageSrc};
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
	for (const f of parsePeopleFromFrontmatter(
		app,
		projectPath,
		projectFm,
		peopleField,
		peopleFolder,
		matchIndex,
	)) {
		addPerson(f);
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
