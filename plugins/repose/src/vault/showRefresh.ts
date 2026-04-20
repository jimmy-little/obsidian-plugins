import type { App, TFile } from "obsidian";
import { Notice } from "obsidian";
import {
	getSeasonEpisodes,
	getShowSeasons,
	getTraktArtUrls,
	getTraktShow,
	type TraktArtUrls,
} from "../trakt/client";
import { resolveEpisodeTraktIdForFile } from "../trakt/resolveEpisodeTraktId";
import {
	applyEpisodeWatchFieldsFromTrakt,
	applyShowWatchedFromTraktProgress,
	fetchEpisodeWatchHistoryIsos,
	fetchShowWatchedProgress,
	fetchWatchedSeasonEpisodeDatesFromSyncWatchedShows,
	readTraktIdFromFrontmatter,
	type ShowWatchedProgress,
	type TraktSettingsStore,
} from "../trakt/watchedSync";
import { collectEpisodeNoteFiles, readEpisodeRow } from "../media/showEpisodes";
import type { ReposeSettings } from "../settings";
import {
	addTraktEpisodeNextToShowBundle,
	fetchEpisodeStill,
	fetchImagesForItem,
} from "./reposeImport";
import {
	downloadObsidianImages,
	downloadTraktArtToNoteFolder,
	traktToObsidianFrontmatter,
	type TraktEpisode,
	type TraktShowOrMovie,
} from "./traktNotes";

export function applyMergedFm(
	fm: Record<string, unknown>,
	merged: Record<string, unknown>,
	preserveDate: boolean,
): void {
	const keepDate = fm.date;
	for (const [k, v] of Object.entries(merged)) {
		if (v === undefined) continue;
		if (k === "date" && preserveDate && keepDate) continue;
		fm[k] = v;
	}
	if (preserveDate && keepDate) fm.date = keepDate;
}

type WatchSnap = {
	watchedDate: unknown;
	watchedDates: unknown;
	reposeStatus: unknown;
};

function snapWatch(fm: Record<string, unknown>): WatchSnap {
	return {
		watchedDate: fm.watchedDate,
		watchedDates: fm.watchedDates,
		reposeStatus: fm.reposeStatus,
	};
}

function restoreWatch(fm: Record<string, unknown>, s: WatchSnap): void {
	if (s.watchedDate !== undefined) fm.watchedDate = s.watchedDate;
	else delete fm.watchedDate;
	if (s.watchedDates !== undefined) fm.watchedDates = s.watchedDates;
	else delete fm.watchedDates;
	if (s.reposeStatus !== undefined) fm.reposeStatus = s.reposeStatus;
	else delete fm.reposeStatus;
}

export type RefreshShowFromTraktOptions = {
	/**
	 * When true, push Trakt collection / history onto the series note and existing episode notes.
	 * Default true so a full-series refresh matches Trakt watch state (requires Trakt account link).
	 */
	syncWatchStateToExistingNotes: boolean;
	/** Create `SxEE … .md` notes next to the bundle for Trakt episodes not yet in the vault. */
	createMissingEpisodeNotes: boolean;
};

const defaultRefreshShowOptions: RefreshShowFromTraktOptions = {
	syncWatchStateToExistingNotes: true,
	createMissingEpisodeNotes: true,
};

export async function refreshShowFromTrakt(
	app: App,
	settings: ReposeSettings,
	showFile: TFile,
	tokenStore?: TraktSettingsStore,
	options?: Partial<RefreshShowFromTraktOptions>,
): Promise<{ ok: boolean; error?: string }> {
	const opt = { ...defaultRefreshShowOptions, ...options };
	const syncWatch = opt.syncWatchStateToExistingNotes;
	const createMissing = opt.createMissingEpisodeNotes;

	const clientId = settings.traktClientId.trim();
	if (!clientId) {
		return { ok: false, error: "Add your Trakt Client ID in Repose settings to refresh." };
	}

	const cache0 = app.metadataCache.getFileCache(showFile);
	const fm0 = (cache0?.frontmatter ?? {}) as Record<string, unknown>;
	const showTraktId = readTraktIdFromFrontmatter(fm0);
	if (showTraktId == null) {
		return { ok: false, error: "This show note needs a traktId in frontmatter to sync from Trakt." };
	}

	const showApi = await getTraktShow(clientId, showTraktId);
	if (!showApi?.title) {
		return { ok: false, error: "Could not load this show from Trakt (check traktId and network)." };
	}

	const showData: TraktShowOrMovie = {
		...showApi,
		first_aired: showApi.first_aired,
		firstAired: showApi.first_aired,
	};

	let progress: ShowWatchedProgress | null = null;
	if (tokenStore && (syncWatch || createMissing)) {
		progress = await fetchShowWatchedProgress(tokenStore, showTraktId);
	}

	await app.fileManager.processFrontMatter(showFile, (fm) => {
		const w = snapWatch(fm as Record<string, unknown>);
		const merged = traktToObsidianFrontmatter(showData, "show", {}, settings.projectWikilink);
		applyMergedFm(fm as Record<string, unknown>, merged, true);
		if (syncWatch && progress) {
			applyShowWatchedFromTraktProgress(fm as Record<string, unknown>, progress);
		} else {
			restoreWatch(fm as Record<string, unknown>, w);
		}
	});

	let artUrls: TraktArtUrls = { poster: null, banner: null, fanart: null, logo: null, thumb: null };
	const traktArt = await getTraktArtUrls(clientId, "show", showTraktId);
	if (traktArt) artUrls = traktArt;

	const tmdbKey = settings.tmdbApiKey.trim();
	const tmdbId = showData.ids?.tmdb;
	if (tmdbKey && tmdbId != null) {
		const images = await fetchImagesForItem(tmdbKey, tmdbId, "show");
		if (images) {
			if (!artUrls.poster) artUrls.poster = images.posterLarge ?? images.poster ?? null;
			if (!artUrls.banner) artUrls.banner = images.backdropLarge ?? images.backdrop ?? null;
			if (!artUrls.logo) artUrls.logo = images.logo ?? null;
		}
	}
	if (!artUrls.banner && artUrls.fanart) artUrls.banner = artUrls.fanart;

	const artPaths = await downloadTraktArtToNoteFolder(app.vault, showFile.path, artUrls);
	await app.fileManager.processFrontMatter(showFile, (fm) => {
		if (artPaths.banner) fm.banner = `[[${artPaths.banner}]]`;
		if (artPaths.poster) fm.poster = `[[${artPaths.poster}]]`;
		if (artPaths.logo) fm.logo = `[[${artPaths.logo}]]`;
	});

	const episodeFiles = collectEpisodeNoteFiles(app, showFile, settings);
	const seasonsNeeded = new Set<number>();
	for (const f of episodeFiles) {
		const row = readEpisodeRow(app, f);
		if (row.season != null) seasonsNeeded.add(row.season);
	}

	const bySeason = new Map<number, Awaited<ReturnType<typeof getSeasonEpisodes>>>();
	for (const sn of seasonsNeeded) {
		try {
			bySeason.set(sn, await getSeasonEpisodes(clientId, showTraktId, sn));
		} catch {
			bySeason.set(sn, []);
		}
	}

	const showTitle = showApi.title || "Episode";
	const showTmdbForStills = showData.ids?.tmdb;

	const historyByPath = new Map<string, string[] | null>();
	if (tokenStore && syncWatch) {
		for (const epFile of episodeFiles) {
			const row0 = readEpisodeRow(app, epFile);
			if (row0.season == null || row0.episode == null) continue;
			const cacheEp = app.metadataCache.getFileCache(epFile);
			const fmEp = (cacheEp?.frontmatter ?? {}) as Record<string, unknown>;
			let etid: number | null | undefined = readTraktIdFromFrontmatter(fmEp);
			if (etid == null) {
				etid = await resolveEpisodeTraktIdForFile(app, settings, epFile);
				if (etid != null) {
					const tid = etid;
					await app.fileManager.processFrontMatter(epFile, (fm) => {
						(fm as Record<string, unknown>).traktId = tid;
					});
				}
			}
			if (etid == null) {
				historyByPath.set(epFile.path, null);
				continue;
			}
			historyByPath.set(epFile.path, await fetchEpisodeWatchHistoryIsos(tokenStore, etid));
		}
	}

	let syncShowsBySe: Map<string, string> | null = null;
	if (tokenStore && syncWatch) {
		/* Per-show watched S×E from GET /sync/watched/shows (paginated by show — cheap). Do NOT use
		 * GET /sync/watched/episodes for a single series: that endpoint is the user’s entire library and
		 * would require scanning every page (hundreds of requests). */
		syncShowsBySe = await fetchWatchedSeasonEpisodeDatesFromSyncWatchedShows(tokenStore, showTraktId);
		console.log("[Repose/refresh:show]", "watch maps for episode loop", {
			showTraktId,
			syncWatch,
			progressEpisodeKeys: progress?.episodeWatchedDates.size ?? null,
			syncShowsSxEKeys: syncShowsBySe?.size ?? null,
			episodeNoteCount: episodeFiles.length,
		});
	} else if (syncWatch && !tokenStore) {
		console.log("[Repose/refresh:show]", "syncWatch on but no tokenStore — episode watch sync skipped", {
			showTraktId,
		});
	}

	function shouldApplyWatchState(
		p: ShowWatchedProgress | null,
		h: string[] | null,
		syncShows: Map<string, string> | null,
	): boolean {
		if (p != null) return true;
		if (h !== null) return true;
		if (syncShows != null) return true;
		return false;
	}

	for (const epFile of episodeFiles) {
		const row = readEpisodeRow(app, epFile);
		if (row.season == null || row.episode == null) continue;

		const hist = syncWatch ? (historyByPath.get(epFile.path) ?? null) : null;

		const seasonList = bySeason.get(row.season);
		const hit =
			seasonList?.length ?
				seasonList.find((e) => e.number === row.episode)
			:	undefined;

		let epPayload: TraktEpisode | null = null;
		if (hit) {
			const ids = hit.ids as { trakt?: number; imdb?: string; tmdb?: number; tvdb?: number };
			epPayload = {
				title: hit.title,
				overview: hit.overview ?? undefined,
				rating: hit.rating ?? undefined,
				runtime: hit.runtime ?? undefined,
				season: hit.season,
				number: hit.number,
				first_aired: hit.firstAired ?? undefined,
				firstAired: hit.firstAired ?? undefined,
				ids,
			};
		}

		if (epPayload) {
			await app.fileManager.processFrontMatter(epFile, (fm) => {
				const w = snapWatch(fm as Record<string, unknown>);
				const merged = traktToObsidianFrontmatter(epPayload, "episode", {}, settings.projectWikilink);
				applyMergedFm(fm as Record<string, unknown>, merged, true);
				if (syncWatch && shouldApplyWatchState(progress, hist, syncShowsBySe)) {
					applyEpisodeWatchFieldsFromTrakt(
						fm as Record<string, unknown>,
						row.season!,
						row.episode!,
						progress,
						hist,
						null,
						syncShowsBySe,
					);
				} else {
					restoreWatch(fm as Record<string, unknown>, w);
				}
			});
		} else if (syncWatch && shouldApplyWatchState(progress, hist, syncShowsBySe)) {
			await app.fileManager.processFrontMatter(epFile, (fm) => {
				applyEpisodeWatchFieldsFromTrakt(
					fm as Record<string, unknown>,
					row.season!,
					row.episode!,
					progress,
					hist,
					null,
					syncShowsBySe,
				);
			});
		} else {
			continue;
		}

		if (hit && tmdbKey && showTmdbForStills != null) {
			const stillUrl = await fetchEpisodeStill(tmdbKey, showTmdbForStills, row.season, row.episode);
			if (stillUrl) {
				const imgPaths = await downloadObsidianImages(
					app.vault,
					{ episodeStill: stillUrl },
					showTitle,
					{
						showName: showApi.title ?? null,
						season: row.season,
						episode: row.episode,
					},
				);
				if (imgPaths.banner) {
					await app.fileManager.processFrontMatter(epFile, (fm) => {
						fm.banner = `[[${imgPaths.banner}]]`;
					});
				}
			}
		}
	}

	if (createMissing) {
		const existingKeys = new Set<string>();
		for (const f of episodeFiles) {
			const r = readEpisodeRow(app, f);
			if (r.season != null && r.episode != null) {
				existingKeys.add(`${r.season}:${r.episode}`);
			}
		}

		let progressForNew: ShowWatchedProgress | null = progress;
		if (tokenStore && progressForNew === null) {
			progressForNew = await fetchShowWatchedProgress(tokenStore, showTraktId);
		}

		let created = 0;
		try {
			const seasonsMeta = await getShowSeasons(clientId, showTraktId);
			for (const sm of seasonsMeta) {
				const sn = sm.number;
				if (sn === undefined || Number.isNaN(sn)) continue;

				let eps: Awaited<ReturnType<typeof getSeasonEpisodes>>;
				try {
					eps = await getSeasonEpisodes(clientId, showTraktId, sn);
				} catch {
					continue;
				}

				for (const hit of eps) {
					const key = `${hit.season}:${hit.number}`;
					if (existingKeys.has(key)) continue;

					const ids = hit.ids as { trakt?: number; imdb?: string; tmdb?: number; tvdb?: number };
					const epPayload: TraktEpisode = {
						title: hit.title,
						overview: hit.overview ?? undefined,
						rating: hit.rating ?? undefined,
						runtime: hit.runtime ?? undefined,
						season: hit.season,
						number: hit.number,
						first_aired: hit.firstAired ?? undefined,
						firstAired: hit.firstAired ?? undefined,
						ids,
					};

					let stillUrl: string | null = null;
					if (tmdbKey && showTmdbForStills != null && hit.season != null && hit.number != null) {
						stillUrl = await fetchEpisodeStill(tmdbKey, showTmdbForStills, hit.season, hit.number);
					}

					try {
						await addTraktEpisodeNextToShowBundle(
							app.vault,
							settings,
							showFile,
							epPayload,
							showData,
							stillUrl,
							tokenStore,
							progressForNew,
						);
						existingKeys.add(key);
						created++;
					} catch (e) {
						console.error("[Repose] create episode note:", e);
					}
				}
			}
		} catch (e) {
			console.error("[Repose] list seasons for missing episodes:", e);
		}

		if (created > 0) {
			new Notice(`Added ${created} new episode note${created === 1 ? "" : "s"}.`);
		}
	}

	return { ok: true };
}

type TraktShowApi = NonNullable<Awaited<ReturnType<typeof getTraktShow>>>;

function shouldApplyWatchStateForEp(
	p: ShowWatchedProgress | null,
	h: string[] | null,
	syncShows: Map<string, string> | null,
): boolean {
	if (p != null) return true;
	if (h !== null) return true;
	if (syncShows != null) return true;
	return false;
}

/**
 * Apply Trakt/TMDB data + watch state to one episode note. `seasonList` must be Trakt’s list for that season.
 */
async function applyTraktRefreshToTvEpisodeNote(
	app: App,
	settings: ReposeSettings,
	tokenStore: TraktSettingsStore | undefined,
	showApi: TraktShowApi,
	showData: TraktShowOrMovie,
	progress: ShowWatchedProgress | null,
	syncShowsBySeasonEpisode: Map<string, string> | null,
	seasonList: Awaited<ReturnType<typeof getSeasonEpisodes>>,
	episodeFile: TFile,
): Promise<void> {
	const row = readEpisodeRow(app, episodeFile);
	if (row.season == null || row.episode == null) return;

	const hit = seasonList.find((e) => e.number === row.episode);
	let epPayload: TraktEpisode | null = null;
	if (hit) {
		const ids = hit.ids as { trakt?: number; imdb?: string; tmdb?: number; tvdb?: number };
		epPayload = {
			title: hit.title,
			overview: hit.overview ?? undefined,
			rating: hit.rating ?? undefined,
			runtime: hit.runtime ?? undefined,
			season: hit.season,
			number: hit.number,
			first_aired: hit.firstAired ?? undefined,
			firstAired: hit.firstAired ?? undefined,
			ids,
		};
	}

	const cacheEp = app.metadataCache.getFileCache(episodeFile);
	const fmEp = (cacheEp?.frontmatter ?? {}) as Record<string, unknown>;
	let etid: number | null | undefined = readTraktIdFromFrontmatter(fmEp);
	if (etid == null) {
		etid = await resolveEpisodeTraktIdForFile(app, settings, episodeFile);
		if (etid != null) {
			const tid = etid;
			await app.fileManager.processFrontMatter(episodeFile, (fm) => {
				(fm as Record<string, unknown>).traktId = tid;
			});
		}
	}

	let hist: string[] | null = null;
	if (tokenStore && etid != null) {
		hist = await fetchEpisodeWatchHistoryIsos(tokenStore, etid);
	}

	if (epPayload) {
		await app.fileManager.processFrontMatter(episodeFile, (fm) => {
			const merged = traktToObsidianFrontmatter(epPayload, "episode", {}, settings.projectWikilink);
			applyMergedFm(fm as Record<string, unknown>, merged, true);
			if (shouldApplyWatchStateForEp(progress, hist, syncShowsBySeasonEpisode)) {
				applyEpisodeWatchFieldsFromTrakt(
					fm as Record<string, unknown>,
					row.season!,
					row.episode!,
					progress,
					hist,
					null,
					syncShowsBySeasonEpisode,
				);
			}
		});
	} else if (shouldApplyWatchStateForEp(progress, hist, syncShowsBySeasonEpisode)) {
		await app.fileManager.processFrontMatter(episodeFile, (fm) => {
			applyEpisodeWatchFieldsFromTrakt(
				fm as Record<string, unknown>,
				row.season!,
				row.episode!,
				progress,
				hist,
				null,
				syncShowsBySeasonEpisode,
			);
		});
	}

	const tmdbKey = settings.tmdbApiKey.trim();
	const showTmdb = showData.ids?.tmdb;
	if (hit && tmdbKey && showTmdb != null) {
		const stillUrl = await fetchEpisodeStill(tmdbKey, showTmdb, row.season!, row.episode!);
		if (stillUrl) {
			const imgPaths = await downloadObsidianImages(
				app.vault,
				{ episodeStill: stillUrl },
				showApi.title || "Episode",
				{
					showName: showApi.title ?? null,
					season: row.season,
					episode: row.episode,
				},
			);
			if (imgPaths.banner) {
				await app.fileManager.processFrontMatter(episodeFile, (fm) => {
					fm.banner = `[[${imgPaths.banner}]]`;
				});
			}
		}
	}
}

/**
 * Refresh all vault episode notes for one TV season from Trakt/TMDB (metadata + watch dates per episode).
 */
export async function refreshTvSeasonFromTrakt(
	app: App,
	settings: ReposeSettings,
	tokenStore: TraktSettingsStore | undefined,
	showFile: TFile,
	seasonNumber: number,
): Promise<{ ok: boolean; error?: string }> {
	if (seasonNumber < 0) {
		return { ok: false, error: "Use a numbered season to refresh (not “Other episodes”)." };
	}

	const clientId = settings.traktClientId.trim();
	if (!clientId) {
		return { ok: false, error: "Add your Trakt Client ID in Repose settings to refresh." };
	}

	const showCache = app.metadataCache.getFileCache(showFile);
	const showFm = (showCache?.frontmatter ?? {}) as Record<string, unknown>;
	const showTraktId = readTraktIdFromFrontmatter(showFm);
	if (showTraktId == null) {
		return { ok: false, error: "The series note needs a traktId in frontmatter to sync episodes." };
	}

	const showApi = await getTraktShow(clientId, showTraktId);
	if (!showApi?.title) {
		return { ok: false, error: "Could not load this show from Trakt (check traktId and network)." };
	}

	const showData: TraktShowOrMovie = {
		...showApi,
		first_aired: showApi.first_aired,
		firstAired: showApi.first_aired,
	};

	let progress: ShowWatchedProgress | null = null;
	let syncShowsBySe: Map<string, string> | null = null;
	if (tokenStore) {
		progress = await fetchShowWatchedProgress(tokenStore, showTraktId);
		syncShowsBySe = await fetchWatchedSeasonEpisodeDatesFromSyncWatchedShows(tokenStore, showTraktId);
		console.log("[Repose/refresh:season]", "watch maps before season episode loop", {
			showTraktId,
			seasonNumber,
			progressEpisodeKeys: progress?.episodeWatchedDates.size ?? null,
			syncShowsSxEKeys: syncShowsBySe?.size ?? null,
		});
	} else {
		console.log("[Repose/refresh:season]", "no tokenStore — skipping Trakt watch API calls", {
			showTraktId,
			seasonNumber,
		});
	}

	const episodeFiles = collectEpisodeNoteFiles(app, showFile, settings).filter((f) => {
		const r = readEpisodeRow(app, f);
		return r.season === seasonNumber;
	});
	if (episodeFiles.length === 0) {
		return { ok: false, error: "No episode notes in the vault for this season." };
	}

	let seasonList: Awaited<ReturnType<typeof getSeasonEpisodes>>;
	try {
		seasonList = await getSeasonEpisodes(clientId, showTraktId, seasonNumber);
	} catch {
		seasonList = [];
	}

	for (const epFile of episodeFiles) {
		await applyTraktRefreshToTvEpisodeNote(
			app,
			settings,
			tokenStore,
			showApi,
			showData,
			progress,
			syncShowsBySe,
			seasonList,
			epFile,
		);
	}

	return { ok: true };
}

/**
 * Refresh a single TV episode note from Trakt/TMDB: metadata plus watch dates / status from Trakt.
 * Does not run a full-series refresh.
 */
export async function refreshTvEpisodeFromTrakt(
	app: App,
	settings: ReposeSettings,
	tokenStore: TraktSettingsStore | undefined,
	episodeFile: TFile,
	showFile: TFile,
): Promise<{ ok: boolean; error?: string }> {
	const clientId = settings.traktClientId.trim();
	if (!clientId) {
		return { ok: false, error: "Add your Trakt Client ID in Repose settings to refresh." };
	}

	const showCache = app.metadataCache.getFileCache(showFile);
	const showFm = (showCache?.frontmatter ?? {}) as Record<string, unknown>;
	const showTraktId = readTraktIdFromFrontmatter(showFm);
	if (showTraktId == null) {
		return { ok: false, error: "The series note needs a traktId in frontmatter to sync this episode." };
	}

	const showApi = await getTraktShow(clientId, showTraktId);
	if (!showApi?.title) {
		return { ok: false, error: "Could not load this show from Trakt (check traktId and network)." };
	}

	const row = readEpisodeRow(app, episodeFile);
	if (row.season == null || row.episode == null) {
		return {
			ok: false,
			error: "This episode needs a season and episode (frontmatter or SxxEyy file name).",
		};
	}

	const showData: TraktShowOrMovie = {
		...showApi,
		first_aired: showApi.first_aired,
		firstAired: showApi.first_aired,
	};

	let progress: ShowWatchedProgress | null = null;
	let syncShowsBySe: Map<string, string> | null = null;
	if (tokenStore) {
		progress = await fetchShowWatchedProgress(tokenStore, showTraktId);
		syncShowsBySe = await fetchWatchedSeasonEpisodeDatesFromSyncWatchedShows(tokenStore, showTraktId);
	}

	let seasonList: Awaited<ReturnType<typeof getSeasonEpisodes>>;
	try {
		seasonList = await getSeasonEpisodes(clientId, showTraktId, row.season);
	} catch {
		seasonList = [];
	}

	await applyTraktRefreshToTvEpisodeNote(
		app,
		settings,
		tokenStore,
		showApi,
		showData,
		progress,
		syncShowsBySe,
		seasonList,
		episodeFile,
	);

	return { ok: true };
}
