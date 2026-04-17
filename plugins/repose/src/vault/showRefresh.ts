import type { App, TFile } from "obsidian";
import { getSeasonEpisodes, getTraktArtUrls, getTraktShow, type TraktArtUrls } from "../trakt/client";
import {
	applyEpisodeWatchedFromTraktProgress,
	applyShowWatchedFromTraktProgress,
	fetchShowWatchedProgress,
	readTraktIdFromFrontmatter,
	type ShowWatchedProgress,
	type TraktSettingsStore,
} from "../trakt/watchedSync";
import { collectEpisodeNoteFiles, readEpisodeRow } from "../media/showEpisodes";
import type { ReposeSettings } from "../settings";
import { fetchEpisodeStill, fetchImagesForItem } from "./reposeImport";
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

export async function refreshShowFromTrakt(
	app: App,
	settings: ReposeSettings,
	showFile: TFile,
	tokenStore?: TraktSettingsStore,
): Promise<{ ok: boolean; error?: string }> {
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
	if (tokenStore) {
		progress = await fetchShowWatchedProgress(tokenStore, showTraktId);
	}

	await app.fileManager.processFrontMatter(showFile, (fm) => {
		const prevWatched = fm.watchedDate;
		const prevRepose = fm.reposeStatus;
		const merged = traktToObsidianFrontmatter(showData, "show", {}, settings.projectWikilink);
		applyMergedFm(fm as Record<string, unknown>, merged, true);
		if (progress) {
			applyShowWatchedFromTraktProgress(fm as Record<string, unknown>, progress);
		} else {
			fm.watchedDate = prevWatched;
			fm.reposeStatus = prevRepose;
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

	const episodeFiles = collectEpisodeNoteFiles(app, showFile);
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

	for (const epFile of episodeFiles) {
		const row = readEpisodeRow(app, epFile);
		if (row.season == null || row.episode == null) continue;
		const seasonList = bySeason.get(row.season);
		if (!seasonList?.length) continue;
		const hit = seasonList.find((e) => e.number === row.episode);
		if (!hit) continue;

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

		await app.fileManager.processFrontMatter(epFile, (fm) => {
			const prevWatched = fm.watchedDate;
			const prevRepose = fm.reposeStatus;
			const merged = traktToObsidianFrontmatter(epPayload, "episode", {}, settings.projectWikilink);
			applyMergedFm(fm as Record<string, unknown>, merged, true);
			if (progress && row.season != null && row.episode != null) {
				applyEpisodeWatchedFromTraktProgress(
					fm as Record<string, unknown>,
					row.season,
					row.episode,
					progress,
				);
			} else {
				fm.watchedDate = prevWatched;
				fm.reposeStatus = prevRepose;
			}
		});

		if (tmdbKey && showTmdbForStills != null) {
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

	return { ok: true };
}
