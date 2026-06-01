import {isUnderFolder, normalizeVaultRelPath} from "./paths";

export interface FolderScopeList {
	include: string[];
	exclude: string[];
	/** Basenames to skip (from `!file:NAME.md` lines). */
	excludeFilenames: string[];
}

/** Split comma- and newline-separated folder paths; trim and dedupe. Empty input → []. */
export function parseFolderPathList(raw: string): string[] {
	return parseFolderScopeList(raw).include;
}

/**
 * Parse include / exclude paths from one list.
 * - `Projects/Work` — include (scan under this folder)
 * - `!Templates/Lists` — exclude (skip this folder and descendants)
 * - `!file:SKILL.md` — exclude any note with that basename (e.g. agent skill checklists)
 * Lines may be prefixed with `!` or `!=` (exclude). Empty include → whole vault minus excludes.
 */
export function parseFolderScopeList(raw: string): FolderScopeList {
	const t = raw.trim();
	if (!t) {
		return {include: [], exclude: [], excludeFilenames: []};
	}
	const include: string[] = [];
	const exclude: string[] = [];
	const excludeFilenames: string[] = [];
	for (const part of t.split(/[\n,]+/)) {
		const line = part.trim();
		if (!line) continue;
		const excludeMatch = line.match(/^!=(.+)$/) ?? line.match(/^!\s*(.+)$/);
		if (excludeMatch) {
			const target = excludeMatch[1].trim();
			const fileMatch = target.match(/^file:(.+)$/i);
			if (fileMatch) {
				const name = fileMatch[1].trim();
				if (name) excludeFilenames.push(name);
			} else {
				const path = normalizeVaultRelPath(target);
				if (path) exclude.push(path);
			}
			continue;
		}
		const path = normalizeVaultRelPath(line);
		if (path) include.push(path);
	}
	return {
		include: [...new Set(include)],
		exclude: [...new Set(exclude)],
		excludeFilenames: [...new Set(excludeFilenames)],
	};
}

/** When `roots` is empty, every path matches (whole vault). Otherwise path must be under one root. */
export function fileMatchesFolderScope(filePath: string, roots: string[]): boolean {
	return fileMatchesFolderScopeWithExcludes(filePath, roots, [], []);
}

/** Include roots (empty = whole vault), minus exclude folders and optional basename blocklist. */
export function fileMatchesFolderScopeWithExcludes(
	filePath: string,
	includeRoots: string[],
	excludeRoots: string[],
	excludeFilenames: string[] = [],
): boolean {
	if (excludeFilenames.length > 0) {
		const base = filePath.split("/").pop() ?? filePath;
		const blocked = excludeFilenames.some(
			(name) => base.localeCompare(name, undefined, {sensitivity: "accent"}) === 0,
		);
		if (blocked) return false;
	}
	if (excludeRoots.some((r) => isUnderFolder(filePath, r))) {
		return false;
	}
	if (includeRoots.length === 0) return true;
	return includeRoots.some((r) => isUnderFolder(filePath, r));
}
