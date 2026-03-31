import {isUnderFolder, normalizeVaultRelPath} from "./paths";

/** Split comma- and newline-separated folder paths; trim and dedupe. Empty input → []. */
export function parseFolderPathList(raw: string): string[] {
	const t = raw.trim();
	if (!t) return [];
	const parts = t
		.split(/[\n,]+/)
		.map((x) => normalizeVaultRelPath(x))
		.filter(Boolean);
	return [...new Set(parts)];
}

/** When `roots` is empty, every path matches (whole vault). Otherwise path must be under one root. */
export function fileMatchesFolderScope(filePath: string, roots: string[]): boolean {
	if (roots.length === 0) return true;
	return roots.some((r) => isUnderFolder(filePath, r));
}
