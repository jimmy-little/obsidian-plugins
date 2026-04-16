import type { TraktEpisode, TraktShowOrMovie } from "../vault/traktNotes";
import type { TraktSearchHit } from "./client";

export type ParsedSearchSelection = {
	kind: "movie" | "show" | "episode";
	item: TraktShowOrMovie | TraktEpisode;
	showForEpisode?: TraktShowOrMovie;
	showTraktId: number | null;
	showTmdbId: number | null;
};

function asShowMovie(data: unknown): TraktShowOrMovie {
	return data && typeof data === "object" ? (data as TraktShowOrMovie) : {};
}

function asEpisode(raw: Record<string, unknown>): TraktEpisode {
	const firstAired =
		(typeof raw.first_aired === "string" && raw.first_aired) ||
		(typeof raw.firstAired === "string" && raw.firstAired) ||
		undefined;
	return {
		title: typeof raw.title === "string" ? raw.title : "",
		season: typeof raw.season === "number" ? raw.season : Number(raw.season),
		number: typeof raw.number === "number" ? raw.number : Number(raw.number),
		overview: raw.overview != null ? String(raw.overview) : undefined,
		firstAired: firstAired,
		first_aired: typeof raw.first_aired === "string" ? raw.first_aired : undefined,
		runtime: raw.runtime != null ? Number(raw.runtime) : undefined,
		rating: raw.rating != null ? Number(raw.rating) : undefined,
		ids: raw.ids && typeof raw.ids === "object" ? (raw.ids as TraktEpisode["ids"]) : {},
	};
}

export function dedupeTraktSearchResults(raw: TraktSearchHit[]): TraktSearchHit[] {
	const sorted = [...raw].sort((a, b) => (b.score || 0) - (a.score || 0));
	const dedup: TraktSearchHit[] = [];
	const seen = new Set<string>();
	for (const r of sorted) {
		let key = "";
		const mv = r.movie as { ids?: { trakt?: number } } | undefined;
		const sh = r.show as { ids?: { trakt?: number } } | undefined;
		const ep = r.episode as { ids?: { trakt?: number } } | undefined;
		if (mv?.ids?.trakt) key = `movie-${mv.ids.trakt}`;
		else if (sh?.ids?.trakt) key = `show-${sh.ids.trakt}`;
		else if (ep?.ids?.trakt) key = `ep-${ep.ids.trakt}`;
		else key = `x-${dedup.length}`;
		if (seen.has(key)) continue;
		seen.add(key);
		dedup.push(r);
		if (dedup.length >= 20) break;
	}
	return dedup;
}

export function labelForSearchHit(row: TraktSearchHit): string {
	if (row.type === "movie" && row.movie) {
		const m = row.movie as { title?: string; year?: number };
		return `${m.title ?? ""} (${m.year ?? ""})`;
	}
	if (row.type === "episode" && row.episode && row.show) {
		const ep = row.episode as { title?: string; season?: number; number?: number };
		const st = row.show as { title?: string } | undefined;
		return `${st?.title ?? "Show"} — ${ep.title ?? ""} (S${ep.season}E${ep.number})`;
	}
	if (row.type === "show" && row.show) {
		const s = row.show as { title?: string; year?: number };
		return `${s.title ?? ""} (${s.year ?? ""})`;
	}
	if (row.movie) {
		const m = row.movie as { title?: string; year?: number };
		return `${m.title ?? ""} (${m.year ?? ""})`;
	}
	if (row.episode && row.show) {
		const ep = row.episode as { title?: string; season?: number; number?: number };
		const st = row.show as { title?: string } | undefined;
		return `${st?.title ?? "Show"} — ${ep.title ?? ""} (S${ep.season}E${ep.number})`;
	}
	if (row.show) {
		const s = row.show as { title?: string; year?: number };
		return `${s.title ?? ""} (${s.year ?? ""})`;
	}
	return "Result";
}

export function parseSearchHit(row: TraktSearchHit): ParsedSearchSelection | null {
	let kind: ParsedSearchSelection["kind"] | null = null;
	let item: TraktShowOrMovie | TraktEpisode | null = null;
	let showForEpisode: TraktShowOrMovie | undefined;
	let showTraktId: number | null = null;
	let showTmdbId: number | null = null;

	if (row.type === "movie" && row.movie) {
		kind = "movie";
		item = asShowMovie(row.movie);
	} else if (row.type === "episode" && row.episode && row.show) {
		const show = row.show as TraktShowOrMovie & { ids?: { tmdb?: number; trakt?: number } };
		kind = "episode";
		item = asEpisode(row.episode as Record<string, unknown>);
		showForEpisode = asShowMovie(show);
		showTmdbId = show.ids?.tmdb ?? null;
		showTraktId = show.ids?.trakt ?? null;
	} else if (row.type === "show" && row.show) {
		const show = row.show as TraktShowOrMovie & { ids?: { trakt?: number; tmdb?: number } };
		kind = "show";
		item = asShowMovie(show);
		showTraktId = show.ids?.trakt ?? null;
		showTmdbId = show.ids?.tmdb ?? null;
	} else if (row.movie) {
		kind = "movie";
		item = asShowMovie(row.movie);
	} else if (row.episode && row.show) {
		const show = row.show as TraktShowOrMovie & { ids?: { tmdb?: number; trakt?: number } };
		kind = "episode";
		item = asEpisode(row.episode as Record<string, unknown>);
		showForEpisode = asShowMovie(show);
		showTmdbId = show.ids?.tmdb ?? null;
		showTraktId = show.ids?.trakt ?? null;
	} else if (row.show) {
		const show = row.show as TraktShowOrMovie & { ids?: { trakt?: number; tmdb?: number } };
		kind = "show";
		item = asShowMovie(show);
		showTraktId = show.ids?.trakt ?? null;
		showTmdbId = show.ids?.tmdb ?? null;
	}

	if (!kind || !item) return null;
	return { kind, item, showForEpisode, showTraktId, showTmdbId };
}

export function episodeFromSeasonRow(
	ep: {
		season: number;
		number: number;
		title: string;
		overview: string | null;
		firstAired: string | null;
		runtime: number | null;
		rating: number | null;
		ids: Record<string, unknown>;
	},
): TraktEpisode {
	return asEpisode(ep as unknown as Record<string, unknown>);
}
