import {TFile, type App} from "obsidian";
import type {FulcrumSettings} from "./settingsDefaults";
import type {AtomicNoteRow, IndexedMeeting, IndexedPerson, IndexedTask} from "./types";
import {isUnderFolder} from "./utils/paths";
import {parseWikiLink} from "./utils/wikilinks";
import {resolveBannerImageSrc} from "./utils/projectVisual";
import {normalizePath} from "obsidian";

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

function parsePeopleFromFrontmatter(
	app: App,
	sourcePath: string,
	fm: Record<string, unknown> | undefined,
	field: string,
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
	for (const link of links) {
		const dest = app.metadataCache.getFirstLinkpathDest(link, sourcePath);
		if (dest instanceof TFile) files.push(dest);
	}
	return files;
}

/** Display name and avatar for a people note (frontmatter `name`, else basename). */
export function getPersonNameAndAvatar(
	app: App,
	file: TFile,
	avatarField: string,
): {name: string; avatarSrc: string | null} {
	const cache = app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter as Record<string, unknown> | undefined;
	const name =
		(typeof fm?.name === "string" && fm.name.trim()) ||
		file.basename.replace(/\.md$/i, "");
	const avatarRaw = fm && avatarField ? (fm[avatarField] as string | undefined) : undefined;
	const avatarSrc = resolveBannerImageSrc(app, file, avatarRaw);
	return {name, avatarSrc};
}

function personFromFile(app: App, file: TFile, avatarField: string): IndexedPerson {
	const {name, avatarSrc} = getPersonNameAndAvatar(app, file, avatarField);
	return {file, name, avatarSrc};
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
	const byPath = new Map<string, IndexedPerson>();

	function addPerson(file: TFile): void {
		if (byPath.has(file.path)) return;
		byPath.set(file.path, personFromFile(app, file, avatarField));
	}

	function addIfUnderPeopleFolder(file: TFile): void {
		if (!peopleFolder) return;
		if (isUnderFolder(file.path, peopleFolder)) addPerson(file);
	}

	const projectCache = app.metadataCache.getFileCache(projectFile);
	const projectFm = projectCache?.frontmatter as Record<string, unknown> | undefined;
	for (const f of parsePeopleFromFrontmatter(app, projectPath, projectFm, peopleField)) {
		addPerson(f);
	}

	if (peopleFolder) {
		async function collectFromFile(file: TFile): Promise<void> {
			try {
				const body = await app.vault.cachedRead(file);
				for (const link of extractWikilinksFromText(body)) {
					const dest = app.metadataCache.getFirstLinkpathDest(link, file.path);
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
