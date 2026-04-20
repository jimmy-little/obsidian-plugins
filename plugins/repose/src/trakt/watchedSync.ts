import { requestUrl } from "obsidian";
import type { ReposeSettings } from "../settings";
import { refreshAccessToken } from "./client";

const TRAKT_API_BASE = "https://api.trakt.tv";

/** Dev-only: watch sync / Trakt API tracing (filter console by `[Repose/Trakt]`). */
function logTrakt(scope: string, message: string, data?: Record<string, unknown>): void {
	if (data && Object.keys(data).length > 0) {
		console.log(`[Repose/Trakt:${scope}]`, message, data);
	} else {
		console.log(`[Repose/Trakt:${scope}]`, message);
	}
}

function errorBodyPreview(res: { text?: string; json?: unknown }): string {
	if (typeof res.text === "string" && res.text.length > 0) {
		return res.text.length > 280 ? `${res.text.slice(0, 280)}…` : res.text;
	}
	try {
		return JSON.stringify(res.json);
	} catch {
		return "";
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function retryAfterMsFromHeaders(h: Record<string, string | undefined> | undefined): number | null {
	if (!h) return null;
	const raw = h["retry-after"] ?? h["Retry-After"];
	if (raw == null || raw === "") return null;
	const sec = parseInt(String(raw).trim(), 10);
	if (!Number.isFinite(sec) || sec < 0) return null;
	return sec * 1000;
}

function isLikelyRateLimitError(e: unknown): boolean {
	const msg = e instanceof Error ? e.message : String(e);
	return /429|Too\s*Many\s*Requests|rate\s*limit/i.test(msg);
}

/**
 * Trakt enforces strict rate limits; burst GETs (e.g. parallel sync calls) often return 429.
 * Obsidian `requestUrl` may throw "Request failed, status 429" instead of returning a body.
 */
async function traktGetWithRetry(
	url: string,
	headers: Record<string, string>,
	logScope: string,
): Promise<Awaited<ReturnType<typeof requestUrl>>> {
	const maxAttempts = 6;
	const pathShort = url.replace(TRAKT_API_BASE, "").split("?")[0];

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const res = await requestUrl({ url, method: "GET", headers });
			if (res.status !== 429 && res.status !== 503) return res;

			const hdr = res.headers as Record<string, string | undefined> | undefined;
			const waitMs =
				retryAfterMsFromHeaders(hdr) ?? Math.min(60_000, 1000 * 2 ** (attempt - 1));
			logTrakt(logScope, "Trakt rate limited (GET), backing off", {
				status: res.status,
				attempt,
				maxAttempts,
				waitSec: Math.round(waitMs / 1000),
				path: pathShort,
			});
			if (attempt >= maxAttempts) return res;
			await sleep(waitMs);
		} catch (e) {
			if (!isLikelyRateLimitError(e) || attempt >= maxAttempts) throw e;
			const waitMs = Math.min(60_000, 1000 * 2 ** (attempt - 1));
			logTrakt(logScope, "Trakt GET threw (429?), backing off", {
				attempt,
				maxAttempts,
				waitSec: Math.round(waitMs / 1000),
				path: pathShort,
				message: (e instanceof Error ? e.message : String(e)).slice(0, 160),
			});
			await sleep(waitMs);
		}
	}
	throw new Error("traktGetWithRetry: exhausted retries");
}

export type TraktSettingsStore = {
	settings: ReposeSettings;
	saveSettings(): Promise<void>;
};

function authHeaders(clientId: string, accessToken: string): Record<string, string> {
	return {
		"Content-Type": "application/json",
		"trakt-api-version": "2",
		"trakt-api-key": clientId.trim(),
		Authorization: `Bearer ${accessToken.trim()}`,
		"User-Agent": "Repose-Media-Tracker/1.0",
	};
}

/** Valid access token, refreshing (and persisting) when expired. */
export async function ensureTraktAccessToken(store: TraktSettingsStore): Promise<string | null> {
	const { settings } = store;
	const cid = settings.traktClientId.trim();
	if (!cid) {
		logTrakt("auth", "ensureTraktAccessToken: no traktClientId in settings");
		return null;
	}
	const access = settings.traktAccessToken.trim();
	const refresh = settings.traktRefreshToken.trim();
	if (!access) {
		logTrakt("auth", "ensureTraktAccessToken: no access token (link Trakt in Repose settings)");
		return null;
	}

	const skew = 120_000;
	if (settings.traktTokenExpiresAt > Date.now() + skew) return access;
	if (!refresh) return access;

	const r = await refreshAccessToken(cid, settings.traktClientSecret.trim(), refresh);
	/* Token was past skew; using a stale access token after a failed refresh yields 401 and no progress sync. */
	if (!r.success || !r.accessToken) {
		logTrakt("auth", "ensureTraktAccessToken: refresh failed; sync calls will get 401", {
			refreshOk: r.success,
		});
		return null;
	}

	settings.traktAccessToken = r.accessToken;
	if (r.refreshToken) settings.traktRefreshToken = r.refreshToken;
	if (r.expiresIn != null) settings.traktTokenExpiresAt = Date.now() + r.expiresIn * 1000;
	await store.saveSettings();
	return r.accessToken;
}

export function readTraktIdFromFrontmatter(fm: Record<string, unknown>): number | undefined {
	const v = fm.traktId ?? fm.trakt;
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string") {
		const n = parseInt(v.trim(), 10);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}

export type ShowWatchedProgress = {
	aired: number;
	completed: number;
	lastWatchedAt: string | null;
	/** `"season:episode"` → `YYYY-MM-DD` */
	episodeWatchedDates: Map<string, string>;
};

function finiteInt(v: unknown): number | undefined {
	if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
	if (typeof v === "string" && v.trim()) {
		const n = parseInt(v.trim(), 10);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}

function episodeRowIsWatched(ep: {
	completed?: boolean;
	watched?: boolean;
	last_watched_at?: string | null;
	watched_at?: string | null;
	plays?: number;
}): boolean {
	if (ep.completed === true) return true;
	if (ep.watched === true) return true;
	if (typeof ep.plays === "number" && ep.plays > 0) return true;
	if (typeof ep.last_watched_at === "string" && ep.last_watched_at.length > 0) return true;
	if (typeof ep.watched_at === "string" && ep.watched_at.length > 0) return true;
	return false;
}

function traktSeasonIndex(s: { number?: unknown; season?: unknown }): number | undefined {
	return finiteInt(s.number) ?? finiteInt(s.season);
}

function traktEpisodeIndex(ep: { number?: unknown; episode?: unknown }): number | undefined {
	return finiteInt(ep.number) ?? finiteInt(ep.episode);
}

function isoDateFromTrakt(iso: string | null | undefined): string {
	if (!iso) return new Date().toISOString().split("T")[0];
	return iso.split("T")[0];
}

/** Normalize to ISO strings, unique, chronological (Trakt returns UTC ISO 8601). */
function uniqSortedHistoryTimestamps(timestamps: string[]): string[] {
	const seen = new Set<string>();
	for (const t of timestamps) {
		const s = typeof t === "string" ? t.trim() : "";
		if (s) seen.add(s);
	}
	return [...seen].sort();
}

/** Calendar YYYY-MM-DD from the latest play in a sorted ISO timestamp list. */
export function calendarDateFromLatestWatchedIsos(isos: string[]): string | null {
	if (isos.length === 0) return null;
	const last = isos[isos.length - 1]!;
	if (/^\d{4}-\d{2}-\d{2}$/.test(last)) return last;
	const d = new Date(last);
	if (Number.isNaN(d.getTime())) return last.split("T")[0] ?? null;
	return d.toISOString().split("T")[0] ?? null;
}

/**
 * GET /sync/history/{type}/{traktId} — all plays for that movie or episode (re-watches).
 * @returns `null` if the endpoint could not be used (auth, 404 for all path variants); otherwise sorted ISO timestamps (possibly empty).
 * @see https://github.com/trakt/trakt-api/issues/121 (movie example path)
 */
async function fetchSyncHistoryWatchedAtForId(
	store: TraktSettingsStore,
	pathCandidates: string[],
): Promise<string[] | null> {
	const cid = store.settings.traktClientId.trim();
	const token = await ensureTraktAccessToken(store);
	if (!cid || !token) return null;

	for (const basePath of pathCandidates) {
		const collected: string[] = [];
		let page = 1;
		const limit = 100;
		let pathWorked = false;
		try {
			for (let guard = 0; guard < 500; guard++) {
				const res = await traktGetWithRetry(
					`${basePath}?page=${page}&limit=${limit}`,
					authHeaders(cid, token),
					"history",
				);
				if (res.status === 404) break;
				if (res.status >= 400) break;
				pathWorked = true;
				const rows = res.json as Array<{ watched_at?: string }>;
				if (!Array.isArray(rows)) break;
				for (const r of rows) {
					if (typeof r.watched_at === "string" && r.watched_at.trim()) {
						collected.push(r.watched_at.trim());
					}
				}
				const hdr = res.headers as Record<string, string | undefined> | undefined;
				const pageCountRaw = hdr?.["x-pagination-page-count"] ?? hdr?.["X-Pagination-Page-Count"];
				const pageCount = pageCountRaw ? parseInt(pageCountRaw, 10) : NaN;
				if (rows.length === 0) break;
				if (Number.isFinite(pageCount) && page >= pageCount) break;
				if (rows.length < limit) break;
				page += 1;
			}
		} catch {
			continue;
		}
		if (pathWorked) return uniqSortedHistoryTimestamps(collected);
	}
	return null;
}

/** All `watched_at` timestamps for an episode (Trakt episode id), including re-watches. */
export async function fetchEpisodeWatchHistoryIsos(
	store: TraktSettingsStore,
	episodeTraktId: number,
): Promise<string[] | null> {
	if (!Number.isFinite(episodeTraktId)) return null;
	const out = await fetchSyncHistoryWatchedAtForId(store, [
		`${TRAKT_API_BASE}/sync/history/episodes/${episodeTraktId}`,
		`${TRAKT_API_BASE}/sync/history/episode/${episodeTraktId}`,
	]);
	logTrakt("history", "fetchEpisodeWatchHistoryIsos", {
		episodeTraktId,
		result:
			out === null
				? "unavailable (endpoint/auth)"
				: out.length === 0
					? "no plays in sync history (normal — watch state still comes from progress + /sync/watched/shows)"
					: `${out.length} play timestamp(s)`,
	});
	return out;
}

/** All `watched_at` timestamps for a movie (Trakt movie id), including re-watches. */
export async function fetchMovieWatchHistoryIsos(
	store: TraktSettingsStore,
	movieTraktId: number,
): Promise<string[] | null> {
	if (!Number.isFinite(movieTraktId)) return null;
	return fetchSyncHistoryWatchedAtForId(store, [
		`${TRAKT_API_BASE}/sync/history/movie/${movieTraktId}`,
		`${TRAKT_API_BASE}/sync/history/movies/${movieTraktId}`,
	]);
}

function lastWatchedFromEpisodeRow(
	ep: { last_watched_at?: string | null; watched_at?: string | null },
	fallback: string | null | undefined,
): string {
	const raw =
		(typeof ep.last_watched_at === "string" && ep.last_watched_at.length > 0
			? ep.last_watched_at
			: undefined) ??
		(typeof ep.watched_at === "string" && ep.watched_at.length > 0 ? ep.watched_at : undefined) ??
		fallback;
	return isoDateFromTrakt(raw ?? undefined);
}

function latestYyyyMmDd(dates: Map<string, string>): string | null {
	let best: string | null = null;
	for (const d of dates.values()) {
		if (!best || d > best) best = d;
	}
	return best;
}

/** GET /shows/:id/progress/watched (requires auth). */
export async function fetchShowWatchedProgress(
	store: TraktSettingsStore,
	showTraktId: number,
): Promise<ShowWatchedProgress | null> {
	const cid = store.settings.traktClientId.trim();
	const token = await ensureTraktAccessToken(store);
	if (!cid || !token || !Number.isFinite(showTraktId)) {
		logTrakt("progress", "fetchShowWatchedProgress: skipped (missing client id, token, or show id)", {
			hasClientId: !!cid,
			hasToken: !!token,
			showTraktId,
		});
		return null;
	}

	try {
		const url = `${TRAKT_API_BASE}/shows/${showTraktId}/progress/watched?specials=false&hidden=false`;
		logTrakt("progress", "GET /shows/…/progress/watched", { showTraktId, url });
		const res = await traktGetWithRetry(url, authHeaders(cid, token), "progress");
		if (res.status >= 400) {
			logTrakt("progress", "GET /shows/…/progress/watched failed", {
				showTraktId,
				status: res.status,
				bodyPreview: errorBodyPreview(res),
			});
			return null;
		}
		const data = res.json as {
			aired?: unknown;
			completed?: unknown;
			last_watched_at?: string | null;
			seasons?: Array<{
				number?: unknown;
				season?: unknown;
				aired?: unknown;
				completed?: unknown;
				episodes?: Array<{
					number?: unknown;
					episode?: unknown;
					completed?: boolean;
					watched?: boolean;
					last_watched_at?: string | null;
					watched_at?: string | null;
					plays?: number;
				}>;
			}>;
		};
		let aired = finiteInt(data.aired) ?? 0;
		let completed = finiteInt(data.completed) ?? 0;
		const episodeWatchedDates = new Map<string, string>();
		const rootLast = typeof data.last_watched_at === "string" ? data.last_watched_at : null;

		if (Array.isArray(data.seasons)) {
			let airedFromSeasons = 0;
			let completedFromSeasons = 0;
			for (const s of data.seasons) {
				const sn = traktSeasonIndex(s);
				const bs = s as { aired?: unknown; completed?: unknown };
				if (finiteInt(bs.aired) != null) airedFromSeasons += finiteInt(bs.aired)!;
				if (finiteInt(bs.completed) != null) completedFromSeasons += finiteInt(bs.completed)!;

				if (!Array.isArray(s.episodes)) continue;
				for (const ep of s.episodes) {
					const en = traktEpisodeIndex(ep);
					if (sn != null && en != null) {
						const key = `${sn}:${en}`;
						if (episodeRowIsWatched(ep)) {
							const d = lastWatchedFromEpisodeRow(ep, rootLast ?? undefined);
							const prev = episodeWatchedDates.get(key);
							if (!prev || d > prev) episodeWatchedDates.set(key, d);
						}
					}
				}
			}
			if (aired === 0 && airedFromSeasons > 0) aired = airedFromSeasons;
			if (completed === 0 && completedFromSeasons > 0) completed = completedFromSeasons;
		}
		logTrakt("progress", "fetchShowWatchedProgress: ok", {
			showTraktId,
			aired,
			completed,
			episodeWatchedDateKeys: episodeWatchedDates.size,
			sampleKeys: [...episodeWatchedDates.keys()].slice(0, 8),
		});
		return {
			aired,
			completed,
			lastWatchedAt: rootLast,
			episodeWatchedDates,
		};
	} catch (e) {
		logTrakt("progress", "fetchShowWatchedProgress: exception", {
			showTraktId,
			error: e instanceof Error ? e.message : String(e),
		});
		return null;
	}
}

/** Apply Trakt watched state to show note frontmatter (Trakt wins). */
export function applyShowWatchedFromTraktProgress(
	fm: Record<string, unknown>,
	progress: ShowWatchedProgress,
): void {
	const aired = progress.aired;
	const completed = progress.completed;
	if (aired > 0 && completed >= aired) {
		const fromRoot = progress.lastWatchedAt ? isoDateFromTrakt(progress.lastWatchedAt) : null;
		const fromEpisodes = latestYyyyMmDd(progress.episodeWatchedDates);
		fm.watchedDate = fromRoot ?? fromEpisodes ?? isoDateFromTrakt(undefined);
		fm.reposeStatus = "watched";
	} else {
		delete fm.watchedDate;
		if (fm.reposeStatus === "watched") fm.reposeStatus = "watching";
	}
}

/**
 * GET /sync/watched/shows — paginated; find `showTraktId` and build `season:episode` → last watched calendar date.
 * Do not use GET /sync/watched/episodes for a single show: that endpoint lists the user’s entire watched library,
 * so filtering by one show id requires scanning every page (O(all watched episodes)).
 */
export async function fetchWatchedSeasonEpisodeDatesFromSyncWatchedShows(
	store: TraktSettingsStore,
	showTraktId: number,
): Promise<Map<string, string> | null> {
	const cid = store.settings.traktClientId.trim();
	const token = await ensureTraktAccessToken(store);
	if (!cid || !token || !Number.isFinite(showTraktId)) {
		logTrakt("syncShows", "fetchWatchedSeasonEpisodeDatesFromSyncWatchedShows: skipped", {
			hasClientId: !!cid,
			hasToken: !!token,
			showTraktId,
		});
		return null;
	}

	let page = 1;
	const limit = 100;

	try {
		for (let safety = 0; safety < 500; safety++) {
			const url = `${TRAKT_API_BASE}/sync/watched/shows?page=${page}&limit=${limit}`;
			logTrakt("syncShows", "GET /sync/watched/shows", { showTraktId, page, limit });
			const res = await traktGetWithRetry(url, authHeaders(cid, token), "syncShows");
			if (res.status >= 400) {
				logTrakt("syncShows", "GET /sync/watched/shows failed", {
					showTraktId,
					page,
					status: res.status,
					bodyPreview: errorBodyPreview(res),
				});
				return null;
			}
			const rows = res.json as Array<{
				last_watched_at?: string;
				show?: { ids?: { trakt?: unknown } };
				seasons?: Array<{
					number?: unknown;
					episodes?: Array<{
						number?: unknown;
						last_watched_at?: string | null;
						watched_at?: string | null;
					}>;
				}>;
			}>;
			if (!Array.isArray(rows)) {
				logTrakt("syncShows", "GET /sync/watched/shows: response is not an array", {
					showTraktId,
					page,
				});
				return null;
			}
			if (rows.length === 0) break;

			for (const row of rows) {
				const sid = finiteInt(row.show?.ids?.trakt);
				if (sid !== showTraktId) continue;

				const map = new Map<string, string>();
				const rootLast = row.last_watched_at;
				for (const s of row.seasons ?? []) {
					const sn = finiteInt(s.number);
					if (sn == null) continue;
					for (const ep of s.episodes ?? []) {
						const en = finiteInt(ep.number);
						if (en == null) continue;
						const key = `${sn}:${en}`;
						const raw = ep.last_watched_at ?? ep.watched_at ?? rootLast;
						const cal = isoDateFromTrakt(raw ?? undefined);
						const prev = map.get(key);
						if (!prev || cal > prev) map.set(key, cal);
					}
				}
				logTrakt("syncShows", "found show in /sync/watched/shows", {
					showTraktId,
					page,
					seasonEpisodeKeys: map.size,
					sampleKeys: [...map.keys()].slice(0, 10),
				});
				return map;
			}

			const hdr = res.headers as Record<string, string | undefined> | undefined;
			const pageCountRaw =
				hdr?.["x-pagination-page-count"] ?? hdr?.["X-Pagination-Page-Count"];
			const pageCount = pageCountRaw ? parseInt(pageCountRaw, 10) : NaN;
			if (Number.isFinite(pageCount) && page >= pageCount) break;
			if (rows.length < limit) break;
			page += 1;
		}
		logTrakt("syncShows", "show trakt id not found in any /sync/watched/shows page (empty map)", {
			showTraktId,
			lastPage: page,
		});
		return new Map();
	} catch (e) {
		logTrakt("syncShows", "fetchWatchedSeasonEpisodeDatesFromSyncWatchedShows: exception", {
			showTraktId,
			error: e instanceof Error ? e.message : String(e),
		});
		return null;
	}
}

/**
 * Apply Trakt watched state to an episode note (Trakt wins).
 * `historyIsos`: every `watched_at` from GET /sync/history/episodes/{id} (re-watches). When `null`, history was not loaded.
 * `syncWatchedByEpisodeTraktId`: optional map from episode Trakt id → date (vault refresh passes `null`; building this from
 * GET /sync/watched/episodes would require scanning the user’s entire watched library).
 * `syncShowsBySeasonEpisode`: from GET /sync/watched/shows for this series, keyed `season:episode`.
 */
export function applyEpisodeWatchFieldsFromTrakt(
	fm: Record<string, unknown>,
	season: number,
	episode: number,
	progress: ShowWatchedProgress | null,
	historyIsos: string[] | null,
	syncWatchedByEpisodeTraktId: Map<number, string> | null = null,
	syncShowsBySeasonEpisode: Map<string, string> | null = null,
): void {
	const key = `${season}:${episode}`;
	const progressDate = progress?.episodeWatchedDates.get(key);
	const etid = readTraktIdFromFrontmatter(fm);
	const showsSyncDate = syncShowsBySeasonEpisode?.get(key);

	if (historyIsos && historyIsos.length > 0) {
		fm.watchedDates = [...historyIsos];
		const cal = calendarDateFromLatestWatchedIsos(historyIsos);
		if (cal) fm.watchedDate = cal;
		fm.reposeStatus = "watched";
		return;
	}

	if (progressDate) {
		fm.watchedDate = progressDate;
		delete fm.watchedDates;
		fm.reposeStatus = "watched";
		return;
	}

	if (showsSyncDate) {
		fm.watchedDate = showsSyncDate;
		delete fm.watchedDates;
		fm.reposeStatus = "watched";
		return;
	}

	if (etid != null && syncWatchedByEpisodeTraktId?.has(etid)) {
		const d = syncWatchedByEpisodeTraktId.get(etid)!;
		fm.watchedDate = d;
		delete fm.watchedDates;
		fm.reposeStatus = "watched";
		return;
	}

	/* Don’t clear local watch fields unless we had Trakt data to apply. Empty history (`[]`) is not “missing” data:
	 * it means no rows in /sync/history for this episode; watch state still comes from progress + /sync/watched/shows.
	 * If those fetches failed (null), bail out and keep local state — do not use historyIsos for this guard. */
	if (progress == null && syncShowsBySeasonEpisode == null && syncWatchedByEpisodeTraktId == null) {
		return;
	}

	delete fm.watchedDate;
	delete fm.watchedDates;
	if (fm.reposeStatus === "watched") fm.reposeStatus = "watching";
}

/** @deprecated Prefer applyEpisodeWatchFieldsFromTrakt with history when refreshing. */
export function applyEpisodeWatchedFromTraktProgress(
	fm: Record<string, unknown>,
	season: number,
	episode: number,
	progress: ShowWatchedProgress,
): void {
	applyEpisodeWatchFieldsFromTrakt(fm, season, episode, progress, null, null, null);
}

/** All watched movies: Trakt id → last watched calendar date. */
export async function fetchWatchedMoviesMap(store: TraktSettingsStore): Promise<Map<number, string> | null> {
	const cid = store.settings.traktClientId.trim();
	const token = await ensureTraktAccessToken(store);
	if (!cid || !token) return null;

	const map = new Map<number, string>();
	let page = 1;
	const limit = 100;

	try {
		for (let safety = 0; safety < 500; safety++) {
			const res = await traktGetWithRetry(
				`${TRAKT_API_BASE}/sync/watched/movies?page=${page}&limit=${limit}`,
				authHeaders(cid, token),
				"syncMovies",
			);
			if (res.status >= 400) return null;
			const rows = res.json as Array<{
				last_watched_at?: string;
				movie?: { ids?: { trakt?: number } };
			}>;
			if (!Array.isArray(rows) || rows.length === 0) break;
			for (const r of rows) {
				const id = finiteInt(r.movie?.ids?.trakt);
				if (id == null) continue;
				map.set(id, isoDateFromTrakt(r.last_watched_at));
			}
			const hdr = res.headers as Record<string, string | undefined> | undefined;
			const pageCountRaw =
				hdr?.["x-pagination-page-count"] ?? hdr?.["X-Pagination-Page-Count"];
			const pageCount = pageCountRaw ? parseInt(pageCountRaw, 10) : NaN;
			if (Number.isFinite(pageCount) && page >= pageCount) break;
			if (rows.length < limit) break;
			page += 1;
		}
		return map;
	} catch {
		return null;
	}
}

function watchedAtIsoFromCalendarDate(yyyyMmDd: string): string {
	const [y, m, d] = yyyyMmDd.split("-").map((x) => parseInt(x, 10));
	if (!y || !m || !d) return new Date().toISOString();
	return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString();
}

export async function pushMovieWatchedToTrakt(
	store: TraktSettingsStore,
	traktId: number,
	watchedAtYyyyMmDd: string,
): Promise<void> {
	const cid = store.settings.traktClientId.trim();
	const token = await ensureTraktAccessToken(store);
	if (!cid || !token) throw new Error("Not connected to Trakt.");
	const res = await requestUrl({
		url: `${TRAKT_API_BASE}/sync/history`,
		method: "POST",
		headers: authHeaders(cid, token),
		body: JSON.stringify({
			movies: [{ ids: { trakt: traktId }, watched_at: watchedAtIsoFromCalendarDate(watchedAtYyyyMmDd) }],
		}),
	});
	if (res.status >= 400) {
		const err =
			typeof res.json === "object" && res.json && "error" in (res.json as object)
				? String((res.json as { error?: string }).error)
				: res.text;
		throw new Error(err || `Trakt history failed (${res.status})`);
	}
}

export async function pushEpisodeWatchedToTrakt(
	store: TraktSettingsStore,
	traktId: number,
	watchedAtYyyyMmDd: string,
): Promise<void> {
	const cid = store.settings.traktClientId.trim();
	const token = await ensureTraktAccessToken(store);
	if (!cid || !token) throw new Error("Not connected to Trakt.");
	const res = await requestUrl({
		url: `${TRAKT_API_BASE}/sync/history`,
		method: "POST",
		headers: authHeaders(cid, token),
		body: JSON.stringify({
			episodes: [{ ids: { trakt: traktId }, watched_at: watchedAtIsoFromCalendarDate(watchedAtYyyyMmDd) }],
		}),
	});
	if (res.status >= 400) {
		const err =
			typeof res.json === "object" && res.json && "error" in (res.json as object)
				? String((res.json as { error?: string }).error)
				: res.text;
		throw new Error(err || `Trakt history failed (${res.status})`);
	}
}

export async function removeMovieWatchedFromTrakt(store: TraktSettingsStore, traktId: number): Promise<void> {
	const cid = store.settings.traktClientId.trim();
	const token = await ensureTraktAccessToken(store);
	if (!cid || !token) throw new Error("Not connected to Trakt.");
	const res = await requestUrl({
		url: `${TRAKT_API_BASE}/sync/history/remove`,
		method: "POST",
		headers: authHeaders(cid, token),
		body: JSON.stringify({ movies: [{ ids: { trakt: traktId } }] }),
	});
	if (res.status >= 400) {
		const err =
			typeof res.json === "object" && res.json && "error" in (res.json as object)
				? String((res.json as { error?: string }).error)
				: res.text;
		throw new Error(err || `Trakt history remove failed (${res.status})`);
	}
}

export async function removeEpisodeWatchedFromTrakt(
	store: TraktSettingsStore,
	traktId: number,
): Promise<void> {
	const cid = store.settings.traktClientId.trim();
	const token = await ensureTraktAccessToken(store);
	if (!cid || !token) throw new Error("Not connected to Trakt.");
	const res = await requestUrl({
		url: `${TRAKT_API_BASE}/sync/history/remove`,
		method: "POST",
		headers: authHeaders(cid, token),
		body: JSON.stringify({ episodes: [{ ids: { trakt: traktId } }] }),
	});
	if (res.status >= 400) {
		const err =
			typeof res.json === "object" && res.json && "error" in (res.json as object)
				? String((res.json as { error?: string }).error)
				: res.text;
		throw new Error(err || `Trakt history remove failed (${res.status})`);
	}
}
