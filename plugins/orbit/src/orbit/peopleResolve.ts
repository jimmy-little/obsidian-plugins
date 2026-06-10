import {normalizePath, TFile, type App} from "obsidian";
import {isFileInPeopleDirs} from "./pathUtils";
import type {OrbitSettings} from "./settings";

/** Normalize for matching `name`, `aliases`, and `alias` against wikilink text. */
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

/** Map normalized match keys → people note files across all configured `peopleDirs`. */
export function buildPeopleDirsMatchIndex(app: App, peopleDirs: string[]): Map<string, TFile> {
	const index = new Map<string, TFile>();
	if (!peopleDirs.length) return index;
	for (const f of app.vault.getMarkdownFiles()) {
		if (!isFileInPeopleDirs(f.path, peopleDirs)) continue;
		const cache = app.metadataCache.getFileCache(f);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		for (const k of personFileMatchKeys(f, fm)) {
			const nk = normalizePersonMatchKey(k);
			if (nk) index.set(nk, f);
		}
	}
	return index;
}

export function lookupPeopleFileByAlias(matchIndex: Map<string, TFile>, linkTextRaw: string): TFile | null {
	const trimmed = linkTextRaw.trim();
	if (!trimmed) return null;
	const pipe = trimmed.indexOf("|");
	const linkCore = (pipe >= 0 ? trimmed.slice(0, pipe) : trimmed).trim();
	const key = normalizePersonMatchKey(linkCore);
	if (!key) return null;
	return matchIndex.get(key) ?? null;
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
 * Resolve a wikilink to a known people note (under `peopleDirs`) or a ghost reference.
 * Ghost: unresolved link, or resolved note outside configured people folders.
 */
export function resolvePersonLink(
	app: App,
	linkText: string,
	displayNameHint: string,
	sourcePath: string,
	peopleDirs: string[],
	matchIndex: Map<string, TFile>,
): ResolvedPersonLink {
	const trimmed = linkText.trim();
	const displayHint = displayNameHint.trim() || trimmed;
	if (!peopleDirs.length) {
		return {kind: "ghost", linkText: trimmed, displayName: displayHint};
	}

	const dest = app.metadataCache.getFirstLinkpathDest(trimmed, sourcePath);
	if (dest instanceof TFile && isFileInPeopleDirs(dest.path, peopleDirs)) {
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
		return {
			kind: "ghost",
			linkText: trimmed,
			displayName: displayHint,
		};
	}

	return {
		kind: "ghost",
		linkText: trimmed,
		displayName: displayHint,
	};
}

export function resolvePersonLinksFromSettings(
	app: App,
	linkText: string,
	displayNameHint: string,
	sourcePath: string,
	settings: OrbitSettings,
	matchIndex?: Map<string, TFile>,
): ResolvedPersonLink {
	const index = matchIndex ?? buildPeopleDirsMatchIndex(app, settings.peopleDirs);
	return resolvePersonLink(app, linkText, displayNameHint, sourcePath, settings.peopleDirs, index);
}
