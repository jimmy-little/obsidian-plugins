import { requestUrl } from "obsidian";
import type { ImageSlot } from "./reposeLayout";

const TMDB_IMG = "https://image.tmdb.org/t/p";

interface TmdbFile {
	file_path: string;
	iso_639_1: string | null;
	vote_average?: number;
	vote_count?: number;
	width?: number;
	height?: number;
}

interface TmdbImagesResponse {
	id: number;
	backdrops?: TmdbFile[];
	posters?: TmdbFile[];
	logos?: TmdbFile[];
}

function preferLangFirst(items: TmdbFile[], lang: string): TmdbFile[] {
	const match = items.filter((i) => i.iso_639_1 === lang);
	if (match.length) return sortByVotes(match);
	const neutral = items.filter((i) => i.iso_639_1 == null);
	if (neutral.length) return sortByVotes(neutral);
	return sortByVotes(items.slice());
}

function sortByVotes(items: TmdbFile[]): TmdbFile[] {
	return items.slice().sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
}

function fullUrl(size: string, filePath: string): string {
	const path = filePath.startsWith("/") ? filePath.slice(1) : filePath;
	return `${TMDB_IMG}/${size}/${path}`;
}

export async function fetchTmdbImageDownloadUrls(
	kind: "movie" | "tv",
	tmdbId: number,
	apiKey: string,
): Promise<Record<ImageSlot, string | null>> {
	const base =
		kind === "movie"
			? `https://api.themoviedb.org/3/movie/${tmdbId}/images`
			: `https://api.themoviedb.org/3/tv/${tmdbId}/images`;
	const url = `${base}?api_key=${encodeURIComponent(apiKey)}`;

	const res = await requestUrl({ url, method: "GET" });
	if (res.status < 200 || res.status >= 300) {
		throw new Error(`TMDB images HTTP ${res.status}`);
	}
	const data = res.json as TmdbImagesResponse;

	const posters = preferLangFirst(data.posters ?? [], "en");
	const backdrops = preferLangFirst(data.backdrops ?? [], "en");
	const logos = preferLangFirst(data.logos ?? [], "en");

	const posterPath = posters[0]?.file_path ?? null;
	const backdropPath = backdrops[0]?.file_path ?? null;
	const logoPath = logos[0]?.file_path ?? null;

	return {
		poster: posterPath ? fullUrl("w780", posterPath) : null,
		thumb: posterPath ? fullUrl("w185", posterPath) : null,
		banner: backdropPath ? fullUrl("w1280", backdropPath) : null,
		logo: logoPath ? fullUrl("w500", logoPath) : null,
	};
}
