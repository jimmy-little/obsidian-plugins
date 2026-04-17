/** External ids stored in note frontmatter (Trakt / TVDB / IGDB). */

export function readTvdbIdFromFrontmatter(fm: Record<string, unknown>): number | undefined {
	const v = fm.tvdbId ?? fm.tvdb;
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string") {
		const n = parseInt(v.trim(), 10);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}

export function readTmdbIdFromFrontmatter(fm: Record<string, unknown>): number | undefined {
	const v = fm.tmdbId ?? fm.tmdb;
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string") {
		const n = parseInt(v.trim(), 10);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}

export function readIgdbIdFromFrontmatter(fm: Record<string, unknown>): number | undefined {
	const v = fm.igdbId ?? fm.igdb;
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string") {
		const n = parseInt(v.trim(), 10);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}
