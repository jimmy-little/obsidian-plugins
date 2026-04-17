import { requestUrl } from "obsidian";
import type { ReposeSettings } from "../settings";
import { refreshAccessToken } from "./client";

const TRAKT_API_BASE = "https://api.trakt.tv";

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
	if (!cid) return null;
	const access = settings.traktAccessToken.trim();
	const refresh = settings.traktRefreshToken.trim();
	if (!access) return null;

	const skew = 120_000;
	if (settings.traktTokenExpiresAt > Date.now() + skew) return access;
	if (!refresh) return access;

	const r = await refreshAccessToken(cid, settings.traktClientSecret.trim(), refresh);
	if (!r.success || !r.accessToken) return access;

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

function episodeRowIsWatched(ep: {
	completed?: boolean;
	last_watched_at?: string | null;
	plays?: number;
}): boolean {
	if (ep.completed === true) return true;
	if (typeof ep.plays === "number" && ep.plays > 0) return true;
	if (typeof ep.last_watched_at === "string" && ep.last_watched_at.length > 0) return true;
	return false;
}

function isoDateFromTrakt(iso: string | null | undefined): string {
	if (!iso) return new Date().toISOString().split("T")[0];
	return iso.split("T")[0];
}

/** GET /shows/:id/progress/watched (requires auth). */
export async function fetchShowWatchedProgress(
	store: TraktSettingsStore,
	showTraktId: number,
): Promise<ShowWatchedProgress | null> {
	const cid = store.settings.traktClientId.trim();
	const token = await ensureTraktAccessToken(store);
	if (!cid || !token || !Number.isFinite(showTraktId)) return null;

	try {
		const res = await requestUrl({
			url: `${TRAKT_API_BASE}/shows/${showTraktId}/progress/watched?specials=false&hidden=false`,
			method: "GET",
			headers: authHeaders(cid, token),
		});
		if (res.status >= 400) return null;
		const data = res.json as {
			aired?: number;
			completed?: number;
			last_watched_at?: string | null;
			seasons?: Array<{
				number: number;
				episodes?: Array<{
					number: number;
					completed?: boolean;
					last_watched_at?: string | null;
					plays?: number;
				}>;
			}>;
		};
		const episodeWatchedDates = new Map<string, string>();
		if (Array.isArray(data.seasons)) {
			for (const s of data.seasons) {
				if (!Array.isArray(s.episodes)) continue;
				for (const ep of s.episodes) {
					if (!episodeRowIsWatched(ep)) continue;
					const key = `${s.number}:${ep.number}`;
					const d = isoDateFromTrakt(ep.last_watched_at ?? data.last_watched_at ?? undefined);
					episodeWatchedDates.set(key, d);
				}
			}
		}
		return {
			aired: typeof data.aired === "number" ? data.aired : 0,
			completed: typeof data.completed === "number" ? data.completed : 0,
			lastWatchedAt: typeof data.last_watched_at === "string" ? data.last_watched_at : null,
			episodeWatchedDates,
		};
	} catch {
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
	if (aired > 0 && completed >= aired && progress.lastWatchedAt) {
		fm.watchedDate = isoDateFromTrakt(progress.lastWatchedAt);
		fm.reposeStatus = "watched";
	} else {
		delete fm.watchedDate;
		if (fm.reposeStatus === "watched") fm.reposeStatus = "watching";
	}
}

/** Apply Trakt watched state to an episode note (Trakt wins). */
export function applyEpisodeWatchedFromTraktProgress(
	fm: Record<string, unknown>,
	season: number,
	episode: number,
	progress: ShowWatchedProgress,
): void {
	const key = `${season}:${episode}`;
	const d = progress.episodeWatchedDates.get(key);
	if (d) {
		fm.watchedDate = d;
		fm.reposeStatus = "watched";
	} else {
		delete fm.watchedDate;
		if (fm.reposeStatus === "watched") fm.reposeStatus = "watching";
	}
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
			const res = await requestUrl({
				url: `${TRAKT_API_BASE}/sync/watched/movies?page=${page}&limit=${limit}`,
				method: "GET",
				headers: authHeaders(cid, token),
			});
			if (res.status >= 400) return null;
			const rows = res.json as Array<{
				last_watched_at?: string;
				movie?: { ids?: { trakt?: number } };
			}>;
			if (!Array.isArray(rows) || rows.length === 0) break;
			for (const r of rows) {
				const id = r.movie?.ids?.trakt;
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
