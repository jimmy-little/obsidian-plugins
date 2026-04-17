import type { App, TFile } from "obsidian";
import { Notice } from "obsidian";
import {
	artUrlsForIgdbGame,
	getIgdbGameById,
	igdbGamePickMetaLine,
	igdbGamePickThumbUrl,
	normalizeGenres,
	searchIgdbGames,
	type IgdbGame,
} from "../igdb/client";
import { RefreshMatchModal } from "../modals/RefreshMatchModal";
import { resolveMediaTypeForFile } from "../media/mediaDetect";
import { titleFromFrontmatterOrFile } from "../media/mediaModel";
import type { ReposeSettings } from "../settings";
import {
	getTraktMovie,
	searchTrakt,
	searchTraktByTmdb,
	searchTraktByTvdb,
	type TraktSearchHit,
} from "../trakt/client";
import {
	dedupeTraktSearchResults,
	labelForSearchHit,
	parseSearchHit,
} from "../trakt/searchSelection";
import {
	fetchWatchedMoviesMap,
	readTraktIdFromFrontmatter,
	type TraktSettingsStore,
} from "../trakt/watchedSync";
import { applyMergedFm, refreshShowFromTrakt } from "./showRefresh";
import { canonicalMovieNotePath, fetchImagesForItem, mergeTraktAndTmdbArt } from "./reposeImport";
import {
	readIgdbIdFromFrontmatter,
	readTmdbIdFromFrontmatter,
	readTvdbIdFromFrontmatter,
} from "./mediaIds";
import {
	downloadTraktArtToNoteFolder,
	igdbGameToObsidianFrontmatter,
	traktToObsidianFrontmatter,
	type TraktShowOrMovie,
} from "./traktNotes";

export type RefreshMediaCallbacks = {
	onComplete?: () => void;
};

export type RefreshMediaResult = { ok: boolean; error?: string; deferred?: boolean };

async function writeTraktIdsFromItem(app: App, file: TFile, item: TraktShowOrMovie): Promise<void> {
	const ids = item.ids;
	if (!ids) return;
	await app.fileManager.processFrontMatter(file, (fm) => {
		if (ids.trakt != null) (fm as Record<string, unknown>).traktId = ids.trakt;
		if (ids.tvdb != null) (fm as Record<string, unknown>).tvdbId = ids.tvdb;
		if (ids.tmdb != null) (fm as Record<string, unknown>).tmdbId = ids.tmdb;
		if (ids.imdb) (fm as Record<string, unknown>).imdbId = ids.imdb;
	});
}

async function refreshGameFromIgdb(
	app: App,
	settings: ReposeSettings,
	file: TFile,
	igdbId: number,
): Promise<{ ok: boolean; error?: string }> {
	const cid = settings.twitchClientId.trim();
	const secret = settings.twitchClientSecret.trim();
	if (!cid || !secret) {
		return { ok: false, error: "Set Twitch Client ID and Secret (IGDB) in Repose settings." };
	}
	const game = await getIgdbGameById(cid, secret, igdbId);
	if (!game) return { ok: false, error: "Could not load this game from IGDB." };

	const genres = normalizeGenres(game);
	const merged = igdbGameToObsidianFrontmatter(game, genres);

	await app.fileManager.processFrontMatter(file, (fm) => {
		const prevW = fm.watchedDate;
		const prevR = fm.reposeStatus;
		applyMergedFm(fm as Record<string, unknown>, merged, true);
		if (prevW) fm.watchedDate = prevW;
		if (prevR) fm.reposeStatus = prevR;
	});

	const { poster, banner } = artUrlsForIgdbGame(game);
	const artPaths = await downloadTraktArtToNoteFolder(app.vault, file.path, {
		poster,
		banner,
		logo: null,
		thumb: poster,
	});

	await app.fileManager.processFrontMatter(file, (fm) => {
		if (artPaths.banner) fm.banner = `[[${artPaths.banner}]]`;
		if (artPaths.poster) fm.poster = `[[${artPaths.poster}]]`;
		if (artPaths.logo) fm.logo = `[[${artPaths.logo}]]`;
	});

	return { ok: true };
}

async function runRefreshMovieFromTrakt(
	app: App,
	settings: ReposeSettings,
	tokenStore: TraktSettingsStore | undefined,
	file: TFile,
	movieTraktId: number,
): Promise<{ ok: boolean; error?: string }> {
	const clientId = settings.traktClientId.trim();
	if (!clientId) {
		return { ok: false, error: "Add your Trakt Client ID in Repose settings." };
	}

	const movieApi = await getTraktMovie(clientId, movieTraktId);
	if (!movieApi?.title) {
		return { ok: false, error: "Could not load this movie from Trakt." };
	}

	const movieData: TraktShowOrMovie = { ...movieApi };

	let watchedDate: string | undefined;
	if (tokenStore) {
		const watchedMovies = await fetchWatchedMoviesMap(tokenStore);
		watchedDate = watchedMovies?.get(movieTraktId) ?? undefined;
	}

	await app.fileManager.processFrontMatter(file, (fm) => {
		const prevWatched = fm.watchedDate;
		const prevRepose = fm.reposeStatus;
		const merged = traktToObsidianFrontmatter(movieData, "movie", {}, settings.projectWikilink);
		applyMergedFm(fm as Record<string, unknown>, merged, true);
		if (watchedDate) {
			fm.watchedDate = watchedDate;
			fm.reposeStatus = "watched";
		} else {
			fm.watchedDate = prevWatched;
			fm.reposeStatus = prevRepose;
		}
	});

	const tmdbKey = settings.tmdbApiKey.trim();
	const tmdbImages =
		tmdbKey && movieData.ids?.tmdb != null
			? await fetchImagesForItem(tmdbKey, movieData.ids.tmdb, "movie")
			: null;

	const artUrls = await mergeTraktAndTmdbArt(settings, movieData, "movie", tmdbImages);
	const notePathForArt = canonicalMovieNotePath(
		settings,
		movieData.title || file.basename.replace(/\.md$/i, ""),
	);
	const artPaths = await downloadTraktArtToNoteFolder(app.vault, notePathForArt, artUrls);

	await app.fileManager.processFrontMatter(file, (fm) => {
		if (artPaths.banner) fm.banner = `[[${artPaths.banner}]]`;
		if (artPaths.poster) fm.poster = `[[${artPaths.poster}]]`;
		if (artPaths.logo) fm.logo = `[[${artPaths.logo}]]`;
	});

	return { ok: true };
}

async function resolveMovieTraktId(
	app: App,
	file: TFile,
	clientId: string,
	fm: Record<string, unknown>,
): Promise<number | null> {
	let tid = readTraktIdFromFrontmatter(fm);
	if (tid != null) return tid;

	const tmdbId = readTmdbIdFromFrontmatter(fm);
	if (tmdbId != null) {
		const tmdbHits = await searchTraktByTmdb(clientId, tmdbId, "movie");
		const p = tmdbHits[0] ? parseSearchHit(tmdbHits[0]) : null;
		if (p?.kind === "movie") {
			const item = p.item as TraktShowOrMovie;
			if (item.ids?.trakt != null) {
				await writeTraktIdsFromItem(app, file, item);
				return item.ids.trakt;
			}
		}
	}

	const tvdbId = readTvdbIdFromFrontmatter(fm);
	if (tvdbId != null) {
		const hits = await searchTraktByTvdb(clientId, tvdbId, "movie");
		const p = hits[0] ? parseSearchHit(hits[0]) : null;
		if (p?.kind === "movie") {
			const item = p.item as TraktShowOrMovie;
			if (item.ids?.trakt != null) {
				await writeTraktIdsFromItem(app, file, item);
				return item.ids.trakt;
			}
		}
	}

	return null;
}

async function resolveShowTraktId(
	app: App,
	file: TFile,
	clientId: string,
	fm: Record<string, unknown>,
): Promise<number | null> {
	let tid = readTraktIdFromFrontmatter(fm);
	if (tid != null) return tid;

	const tmdbId = readTmdbIdFromFrontmatter(fm);
	if (tmdbId != null) {
		const tmdbHits = await searchTraktByTmdb(clientId, tmdbId, "show");
		const p = tmdbHits[0] ? parseSearchHit(tmdbHits[0]) : null;
		if (p?.kind === "show") {
			const item = p.item as TraktShowOrMovie;
			if (item.ids?.trakt != null) {
				await writeTraktIdsFromItem(app, file, item);
				return item.ids.trakt;
			}
		}
	}

	const tvdbId = readTvdbIdFromFrontmatter(fm);
	if (tvdbId != null) {
		const hits = await searchTraktByTvdb(clientId, tvdbId, "show");
		const p = hits[0] ? parseSearchHit(hits[0]) : null;
		if (p?.kind === "show") {
			const item = p.item as TraktShowOrMovie;
			if (item.ids?.trakt != null) {
				await writeTraktIdsFromItem(app, file, item);
				return item.ids.trakt;
			}
		}
	}

	return null;
}

async function pickMovieAndRefresh(
	app: App,
	settings: ReposeSettings,
	tokenStore: TraktSettingsStore | undefined,
	file: TFile,
	hit: TraktSearchHit,
): Promise<{ ok: boolean; error?: string }> {
	const p = parseSearchHit(hit);
	if (p?.kind !== "movie") return { ok: false, error: "Not a movie result." };
	const item = p.item as TraktShowOrMovie;
	const trakt = item.ids?.trakt;
	if (trakt == null) return { ok: false, error: "This result has no Trakt id." };
	await writeTraktIdsFromItem(app, file, item);
	return runRefreshMovieFromTrakt(app, settings, tokenStore, file, trakt);
}

async function pickShowAndRefresh(
	app: App,
	settings: ReposeSettings,
	tokenStore: TraktSettingsStore | undefined,
	file: TFile,
	hit: TraktSearchHit,
): Promise<{ ok: boolean; error?: string }> {
	const p = parseSearchHit(hit);
	if (p?.kind !== "show") return { ok: false, error: "Not a TV show result." };
	const item = p.item as TraktShowOrMovie;
	if (item.ids?.trakt == null) return { ok: false, error: "This result has no Trakt id." };
	await writeTraktIdsFromItem(app, file, item);
	return refreshShowFromTrakt(app, settings, file, tokenStore);
}

async function refreshMovieFlow(
	app: App,
	settings: ReposeSettings,
	tokenStore: TraktSettingsStore | undefined,
	file: TFile,
	fm: Record<string, unknown>,
	callbacks?: RefreshMediaCallbacks,
): Promise<RefreshMediaResult> {
	const clientId = settings.traktClientId.trim();
	if (!clientId) {
		return { ok: false, error: "Add your Trakt Client ID in Repose settings." };
	}

	const tid = await resolveMovieTraktId(app, file, clientId, fm);
	if (tid != null) {
		return runRefreshMovieFromTrakt(app, settings, tokenStore, file, tid);
	}

	const title = titleFromFrontmatterOrFile(fm, file).trim();
	if (!title) return { ok: false, error: "Add a title to search Trakt." };

	const raw = await searchTrakt(clientId, title, "movie");
	const results = dedupeTraktSearchResults(raw).filter((h) => parseSearchHit(h)?.kind === "movie");
	if (results.length === 0) {
		return { ok: false, error: "No Trakt movie results for this title." };
	}

	if (results.length === 1) {
		return pickMovieAndRefresh(app, settings, tokenStore, file, results[0]);
	}

	new RefreshMatchModal(
		app,
		"Match movie",
		results.map((r) => ({ label: labelForSearchHit(r), value: r })),
		async (hit) => {
			const r = await pickMovieAndRefresh(app, settings, tokenStore, file, hit);
			if (!r.ok) new Notice(r.error ?? "Could not refresh movie.");
			else callbacks?.onComplete?.();
		},
	).open();
	return { ok: true, deferred: true };
}

async function refreshShowLikeFlow(
	app: App,
	settings: ReposeSettings,
	tokenStore: TraktSettingsStore | undefined,
	file: TFile,
	fm: Record<string, unknown>,
	callbacks?: RefreshMediaCallbacks,
): Promise<RefreshMediaResult> {
	const clientId = settings.traktClientId.trim();
	if (!clientId) {
		return { ok: false, error: "Add your Trakt Client ID in Repose settings." };
	}

	const tid = await resolveShowTraktId(app, file, clientId, fm);
	if (tid != null) {
		return refreshShowFromTrakt(app, settings, file, tokenStore);
	}

	const title = titleFromFrontmatterOrFile(fm, file).trim();
	if (!title) return { ok: false, error: "Add a title to search Trakt." };

	const raw = await searchTrakt(clientId, title, "show");
	const results = dedupeTraktSearchResults(raw).filter((h) => parseSearchHit(h)?.kind === "show");
	if (results.length === 0) {
		return { ok: false, error: "No Trakt show results for this title." };
	}

	if (results.length === 1) {
		return pickShowAndRefresh(app, settings, tokenStore, file, results[0]);
	}

	new RefreshMatchModal(
		app,
		"Match TV show",
		results.map((r) => ({ label: labelForSearchHit(r), value: r })),
		async (hit) => {
			const r = await pickShowAndRefresh(app, settings, tokenStore, file, hit);
			if (!r.ok) new Notice(r.error ?? "Could not refresh show.");
			else callbacks?.onComplete?.();
		},
	).open();
	return { ok: true, deferred: true };
}

async function refreshGameFlow(
	app: App,
	settings: ReposeSettings,
	file: TFile,
	fm: Record<string, unknown>,
	callbacks?: RefreshMediaCallbacks,
): Promise<RefreshMediaResult> {
	const igdbId = readIgdbIdFromFrontmatter(fm);
	if (igdbId != null) {
		return refreshGameFromIgdb(app, settings, file, igdbId);
	}

	const cid = settings.twitchClientId.trim();
	const secret = settings.twitchClientSecret.trim();
	if (!cid || !secret) {
		return { ok: false, error: "Set Twitch Client ID and Secret (IGDB) in Repose settings." };
	}

	const title = titleFromFrontmatterOrFile(fm, file).trim();
	if (!title) return { ok: false, error: "Add a title to search IGDB." };

	const results = await searchIgdbGames(cid, secret, title, 15);
	if (results.length === 0) {
		return { ok: false, error: "No IGDB results for this title." };
	}

	if (results.length === 1) {
		return refreshGameFromIgdb(app, settings, file, results[0].id);
	}

	new RefreshMatchModal(
		app,
		"Match game",
		results.map((g) => ({
			label: g.name?.trim() ? g.name.trim() : `IGDB ${g.id}`,
			meta: igdbGamePickMetaLine(g),
			thumbUrl: igdbGamePickThumbUrl(g),
			value: g,
		})),
		async (g) => {
			const r = await refreshGameFromIgdb(app, settings, file, g.id);
			if (!r.ok) new Notice(r.error ?? "Could not refresh game.");
			else callbacks?.onComplete?.();
		},
	).open();
	return { ok: true, deferred: true };
}

/**
 * Refresh metadata and images from Trakt/TMDB (shows, movies, podcasts) or IGDB (games).
 * Uses traktId / tvdbId / igdbId when present; otherwise searches by title and may open a picker modal.
 */
export async function refreshMediaNote(
	app: App,
	settings: ReposeSettings,
	tokenStore: TraktSettingsStore | undefined,
	file: TFile,
	callbacks?: RefreshMediaCallbacks,
): Promise<RefreshMediaResult> {
	const mt = resolveMediaTypeForFile(app, file, settings);
	const cache = app.metadataCache.getFileCache(file);
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;

	if (mt === "game") {
		return refreshGameFlow(app, settings, file, fm, callbacks);
	}
	if (mt === "movie") {
		return refreshMovieFlow(app, settings, tokenStore, file, fm, callbacks);
	}
	if (mt === "show" || mt === "podcast") {
		return refreshShowLikeFlow(app, settings, tokenStore, file, fm, callbacks);
	}

	return {
		ok: false,
		error: "Refresh is only available for movies, TV shows, podcasts, and games.",
	};
}
