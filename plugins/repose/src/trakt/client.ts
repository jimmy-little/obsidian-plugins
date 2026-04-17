import { requestUrl } from "obsidian";

const TRAKT_API_BASE = "https://api.trakt.tv";

function traktHeaders(clientId: string, accessToken?: string): Record<string, string> {
	const h: Record<string, string> = {
		"Content-Type": "application/json",
		"trakt-api-version": "2",
		"trakt-api-key": clientId.trim(),
		"User-Agent": "Repose-Media-Tracker/1.0",
	};
	if (accessToken) h.Authorization = `Bearer ${accessToken}`;
	return h;
}

async function traktJson(
	clientId: string,
	path: string,
	opts: { method?: string; body?: unknown; accessToken?: string } = {},
): Promise<unknown> {
	const res = await requestUrl({
		url: `${TRAKT_API_BASE}${path}`,
		method: opts.method ?? "GET",
		headers: traktHeaders(clientId, opts.accessToken),
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
	});
	if (res.status >= 400) {
		const err = typeof res.json === "object" && res.json && "error" in (res.json as object)
			? String((res.json as { error?: string }).error)
			: res.text;
		throw new Error(`Trakt ${res.status}: ${err || res.text}`);
	}
	return res.json;
}

export async function generateDeviceCode(clientId: string): Promise<{
	success: boolean;
	deviceCode?: string;
	userCode?: string;
	verificationUrl?: string;
	expiresIn?: number;
	interval?: number;
	error?: string;
}> {
	try {
		const data = (await traktJson(clientId, "/oauth/device/code", {
			method: "POST",
			body: { client_id: clientId.trim() },
		})) as {
			device_code: string;
			user_code: string;
			verification_url: string;
			expires_in: number;
			interval: number;
		};
		return {
			success: true,
			deviceCode: data.device_code,
			userCode: data.user_code,
			verificationUrl: data.verification_url,
			expiresIn: data.expires_in,
			interval: data.interval,
		};
	} catch (e) {
		return { success: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export async function pollDeviceToken(
	clientId: string,
	clientSecret: string,
	deviceCode: string,
): Promise<{
	success: boolean;
	pending?: boolean;
	accessToken?: string;
	refreshToken?: string;
	expiresIn?: number;
	tokenType?: string;
	error?: string;
}> {
	const res = await requestUrl({
		url: `${TRAKT_API_BASE}/oauth/device/token`,
		method: "POST",
		headers: traktHeaders(clientId),
		body: JSON.stringify({
			code: deviceCode,
			client_id: clientId.trim(),
			client_secret: clientSecret.trim(),
		}),
	});
	if (res.status === 400) {
		return { success: false, pending: true, error: "Waiting for user authorization" };
	}
	if (res.status >= 400) {
		const err =
			typeof res.json === "object" && res.json && "error" in (res.json as object)
				? String((res.json as { error?: string }).error)
				: res.text;
		return { success: false, pending: false, error: err || res.text };
	}
	const data = res.json as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
		token_type: string;
	};
	return {
		success: true,
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		expiresIn: data.expires_in,
		tokenType: data.token_type,
	};
}

export async function refreshAccessToken(
	clientId: string,
	clientSecret: string,
	refreshToken: string,
): Promise<{
	success: boolean;
	accessToken?: string;
	refreshToken?: string;
	expiresIn?: number;
	error?: string;
}> {
	try {
		const data = (await traktJson(clientId, "/oauth/token", {
			method: "POST",
			body: {
				refresh_token: refreshToken,
				client_id: clientId.trim(),
				client_secret: clientSecret.trim(),
				grant_type: "refresh_token",
			},
		})) as {
			access_token: string;
			refresh_token: string;
			expires_in: number;
		};
		return {
			success: true,
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresIn: data.expires_in,
		};
	} catch (e) {
		return { success: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export interface TraktSearchHit {
	score: number;
	type: string;
	movie?: Record<string, unknown>;
	show?: Record<string, unknown>;
	episode?: Record<string, unknown>;
}

export async function searchTrakt(clientId: string, query: string, type = ""): Promise<TraktSearchHit[]> {
	const searchType = type || "movie,show,episode";
	const params = new URLSearchParams({ query, extended: "full" });
	const data = (await traktJson(clientId, `/search/${searchType}?${params.toString()}`)) as TraktSearchHit[];
	return data.map((result) => ({
		score: result.score,
		type: result.type,
		movie: result.movie,
		show: result.show,
		episode: result.episode,
	}));
}

/** Trakt show summary (`/shows/:id?extended=full`). */
/** First image URL from Trakt `images` arrays (strings or `{ full, medium, thumb }`). */
export function firstTraktImageUrl(entry: unknown): string | null {
	if (typeof entry === "string" && /^https?:\/\//i.test(entry)) return entry;
	if (!entry || typeof entry !== "object") return null;
	const o = entry as Record<string, unknown>;
	for (const k of ["full", "medium", "thumb"]) {
		const v = o[k];
		if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
	}
	return null;
}

function firstFromImageList(arr: unknown): string | null {
	if (!Array.isArray(arr) || arr.length === 0) return null;
	for (const item of arr) {
		const u = firstTraktImageUrl(item);
		if (u) return u;
	}
	return null;
}

/**
 * Trakt `images` values can be a URL string, `{ full, medium, thumb }`, an array of those,
 * or locale buckets like `{ "en": [...], "null": [...] }`.
 */
function firstUrlFromTraktImageValue(val: unknown): string | null {
	if (val == null) return null;
	if (typeof val === "string" && /^https?:\/\//i.test(val)) return val;
	if (Array.isArray(val)) {
		for (const item of val) {
			const u = firstTraktImageUrl(item);
			if (u) return u;
		}
		return null;
	}
	if (typeof val === "object") {
		const direct = firstTraktImageUrl(val);
		if (direct) return direct;
		const o = val as Record<string, unknown>;
		const keys = Object.keys(o);
		if (keys.length === 0) return null;
		const priority = (k: string): number => {
			const lower = k.toLowerCase();
			if (lower === "en") return 0;
			if (lower === "null" || k === "") return 1;
			return 2;
		};
		const sorted = [...keys].sort((a, b) => priority(a) - priority(b));
		for (const k of sorted) {
			const u = firstUrlFromTraktImageValue(o[k]);
			if (u) return u;
		}
	}
	return null;
}

export type TraktArtUrls = {
	poster: string | null;
	/** Trakt horizontal “banner” art only (not fanart). */
	banner: string | null;
	/** Wide scenic art from Trakt; used for hero only if no TMDB backdrop. */
	fanart: string | null;
	logo: string | null;
	thumb: string | null;
};

/** Parse Trakt `images` object from `?extended=images` movie/show payloads. */
export function parseTraktImagesPayload(images: unknown): TraktArtUrls {
	const empty: TraktArtUrls = { poster: null, banner: null, fanart: null, logo: null, thumb: null };
	if (!images || typeof images !== "object") return empty;
	const im = images as Record<string, unknown>;
	const poster = firstUrlFromTraktImageValue(im.poster);
	const banner = firstUrlFromTraktImageValue(im.banner);
	const fanart = firstUrlFromTraktImageValue(im.fanart);
	const logo =
		firstUrlFromTraktImageValue(im.logo) ?? firstUrlFromTraktImageValue(im.clearart);
	const thumb = firstUrlFromTraktImageValue(im.thumb);
	return { poster, banner, fanart, logo, thumb };
}

/**
 * Poster, banner, fanart, logo, and thumb from Trakt (`extended=images`).
 * Hero/backdrop should prefer TMDB backdrop, then Trakt fanart (see merge in import/refresh).
 * No OAuth required — uses `trakt-api-key` header.
 */
export async function getTraktArtUrls(
	clientId: string,
	kind: "movie" | "show",
	traktId: number,
): Promise<TraktArtUrls | null> {
	if (!clientId.trim() || !Number.isFinite(traktId)) return null;
	const path =
		kind === "movie"
			? `/movies/${traktId}?extended=images`
			: `/shows/${traktId}?extended=images`;
	try {
		const data = (await traktJson(clientId, path)) as { images?: unknown };
		return parseTraktImagesPayload(data.images);
	} catch {
		return null;
	}
}

export async function getTraktShow(
	clientId: string,
	showTraktId: number,
): Promise<{
	title?: string;
	year?: number;
	overview?: string;
	rating?: number;
	runtime?: number;
	first_aired?: string;
	status?: string;
	genres?: string[];
	network?: string;
	certification?: string;
	released?: string;
	ids?: { trakt?: number; imdb?: string; tmdb?: number; tvdb?: number };
} | null> {
	try {
		const data = (await traktJson(clientId, `/shows/${showTraktId}?extended=full`)) as {
			title?: string;
			year?: number;
			overview?: string;
			rating?: number;
			runtime?: number;
			first_aired?: string;
			status?: string;
			genres?: unknown;
			network?: string;
			certification?: string;
			released?: string;
			ids?: { trakt?: number; imdb?: string; tmdb?: number; tvdb?: number };
		};
		let genres: string[] | undefined;
		if (Array.isArray(data.genres)) {
			genres = data.genres.map((g) =>
				typeof g === "string" ? g : typeof g === "object" && g && "name" in g ? String((g as { name: string }).name) : "",
			).filter((s) => s.length > 0);
			if (genres.length === 0) genres = undefined;
		}
		return {
			title: data.title,
			year: data.year,
			overview: data.overview,
			rating: data.rating,
			runtime: data.runtime,
			first_aired: data.first_aired,
			status: data.status,
			genres,
			network: data.network,
			certification: data.certification,
			released: data.released,
			ids: data.ids,
		};
	} catch {
		return null;
	}
}

type TmdbImageFile = {
	file_path?: string | null;
	iso_639_1?: string | null;
	vote_average?: number;
	width?: number;
};

function pickTmdbLogoUrl(logos: TmdbImageFile[] | undefined): string | null {
	if (!logos?.length) return null;
	const baseUrl = "https://image.tmdb.org/t/p/original";
	const candidates = logos.filter((l) => l.file_path);
	if (!candidates.length) return null;
	const rank = (l: TmdbImageFile): number => {
		let r = (l.vote_average ?? 0) * 1e6 + (l.width ?? 0);
		const lang = l.iso_639_1;
		if (lang === "en") r += 1e9;
		else if (lang == null) r += 5e8;
		return r;
	};
	candidates.sort((a, b) => rank(b) - rank(a));
	const path = candidates[0].file_path;
	return path ? `${baseUrl}${path}` : null;
}

export async function getTMDBImages(
	tmdbId: number,
	type: "movie" | "show",
	tmdbApiKey: string,
): Promise<{
	poster: string | null;
	posterLarge: string | null;
	backdrop: string | null;
	backdropLarge: string | null;
	logo: string | null;
} | null> {
	if (!tmdbId || !tmdbApiKey) return null;
	const mediaType = type === "show" ? "tv" : "movie";
	try {
		const res = await requestUrl({
			url: `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${encodeURIComponent(
				tmdbApiKey.trim(),
			)}&append_to_response=images`,
		});
		if (res.status >= 400) return null;
		const data = res.json as {
			poster_path?: string | null;
			backdrop_path?: string | null;
			images?: { logos?: TmdbImageFile[] };
		};
		const baseUrl = "https://image.tmdb.org/t/p/";
		return {
			poster: data.poster_path ? `${baseUrl}w500${data.poster_path}` : null,
			posterLarge: data.poster_path ? `${baseUrl}original${data.poster_path}` : null,
			backdrop: data.backdrop_path ? `${baseUrl}w1280${data.backdrop_path}` : null,
			backdropLarge: data.backdrop_path ? `${baseUrl}original${data.backdrop_path}` : null,
			logo: pickTmdbLogoUrl(data.images?.logos),
		};
	} catch {
		return null;
	}
}

export async function getTMDBEpisodeImage(
	tmdbId: number,
	seasonNumber: number,
	episodeNumber: number,
	tmdbApiKey: string,
): Promise<string | null> {
	if (!tmdbApiKey) return null;
	try {
		const res = await requestUrl({
			url: `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}?api_key=${encodeURIComponent(
				tmdbApiKey.trim(),
			)}`,
		});
		if (res.status >= 400) return null;
		const data = res.json as { still_path?: string | null };
		const baseUrl = "https://image.tmdb.org/t/p/";
		return data.still_path ? `${baseUrl}original${data.still_path}` : null;
	} catch {
		return null;
	}
}

/** w185 poster or episode still for search / list rows (requires TMDB API key). */
export async function getThumbnailUrlForSearchHit(
	tmdbApiKey: string,
	row: TraktSearchHit,
): Promise<string | null> {
	const key = tmdbApiKey.trim();
	if (!key) return null;

	const thumbMovie = async () => {
		const tmdb = (row.movie as { ids?: { tmdb?: number } } | undefined)?.ids?.tmdb;
		if (tmdb == null) return null;
		const imgs = await getTMDBImages(tmdb, "movie", key);
		return imgs?.poster?.replace("/w500/", "/w185/") ?? null;
	};
	const thumbShow = async () => {
		const tmdb = (row.show as { ids?: { tmdb?: number } } | undefined)?.ids?.tmdb;
		if (tmdb == null) return null;
		const imgs = await getTMDBImages(tmdb, "show", key);
		return imgs?.poster?.replace("/w500/", "/w185/") ?? null;
	};
	const thumbEpisode = async () => {
		const show = row.show as { ids?: { tmdb?: number } } | undefined;
		const ep = row.episode as { season?: number; number?: number } | undefined;
		const tmdb = show?.ids?.tmdb;
		if (tmdb != null && ep && ep.season != null && ep.number != null) {
			const still = await getTMDBEpisodeImage(tmdb, ep.season, ep.number, key);
			if (still) return still.replace("/original/", "/w185/");
		}
		return thumbShow();
	};

	if (row.type === "movie") return thumbMovie();
	if (row.type === "episode") return thumbEpisode();
	if (row.type === "show") return thumbShow();

	if (row.movie) return thumbMovie();
	if (row.episode && row.show) return thumbEpisode();
	if (row.show) return thumbShow();

	return null;
}

export async function getEpisodeRowStillThumb(
	tmdbApiKey: string,
	showTmdbId: number,
	seasonNumber: number,
	episodeNumber: number,
): Promise<string | null> {
	const still = await getTMDBEpisodeImage(showTmdbId, seasonNumber, episodeNumber, tmdbApiKey);
	if (still) return still.replace("/original/", "/w185/");
	return null;
}

export async function getShowSeasons(
	clientId: string,
	showId: number,
): Promise<
	Array<{
		number: number;
		title: string;
		episodeCount: number;
		airedEpisodes: number;
		overview: string | null;
		firstAired: string | null;
		rating: number | null;
		ids: unknown;
	}>
> {
	const data = (await traktJson(clientId, `/shows/${showId}/seasons?extended=full`)) as Array<{
		number: number;
		title?: string;
		episode_count?: number;
		aired_episodes?: number;
		overview?: string | null;
		first_aired?: string | null;
		rating?: number | null;
		ids?: unknown;
	}>;
	return data.map((season) => ({
		number: season.number,
		title: season.title || `Season ${season.number}`,
		episodeCount: season.episode_count ?? 0,
		airedEpisodes: season.aired_episodes ?? 0,
		overview: season.overview ?? null,
		firstAired: season.first_aired ?? null,
		rating: season.rating ?? null,
		ids: season.ids,
	}));
}

export async function getSeasonEpisodes(
	clientId: string,
	showId: number,
	seasonNumber: number,
): Promise<
	Array<{
		season: number;
		number: number;
		title: string;
		overview: string | null;
		firstAired: string | null;
		runtime: number | null;
		rating: number | null;
		votes: number | null;
		ids: Record<string, unknown>;
	}>
> {
	const data = (await traktJson(clientId, `/shows/${showId}/seasons/${seasonNumber}?extended=full`)) as Array<{
		season?: number;
		number?: number;
		title?: string;
		overview?: string | null;
		first_aired?: string | null;
		runtime?: number | null;
		rating?: number | null;
		votes?: number | null;
		ids?: Record<string, unknown>;
	}>;
	return data.map((episode) => ({
		season: episode.season ?? seasonNumber,
		number: episode.number ?? 0,
		title: episode.title ?? "",
		overview: episode.overview ?? null,
		firstAired: episode.first_aired ?? null,
		runtime: episode.runtime ?? null,
		rating: episode.rating ?? null,
		votes: episode.votes ?? null,
		ids: episode.ids ?? {},
	}));
}
