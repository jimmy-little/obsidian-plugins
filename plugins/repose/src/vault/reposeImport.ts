import { normalizePath, type Vault } from "obsidian";
import { getTMDBEpisodeImage, getTMDBImages, getTraktArtUrls } from "../trakt/client";
import {
	applyEpisodeWatchedFromTraktProgress,
	fetchShowWatchedProgress,
	fetchWatchedMoviesMap,
	type ShowWatchedProgress,
	type TraktSettingsStore,
} from "../trakt/watchedSync";
import { artUrlsForIgdbGame, normalizeGenres, type IgdbGame } from "../igdb/client";
import { folderSegmentsForType, type ReposeSettings } from "../settings";
import {
	downloadObsidianImages,
	downloadTraktArtToNoteFolder,
	igdbGameToObsidianFrontmatter,
	readableMediaName,
	stringifyNote,
	traktToObsidianFrontmatter,
	writeMarkdownFile,
	type TraktEpisode,
	type TraktShowOrMovie,
} from "./traktNotes";

function mediaBase(settings: ReposeSettings): string {
	return settings.mediaRoot.replace(/^\/+|\/+$/g, "");
}

function pathUnderMedia(settings: ReposeSettings, ...segments: string[]): string {
	return normalizePath([mediaBase(settings), ...segments].join("/"));
}

export function vaultPathForShowNote(settings: ReposeSettings, showTitle: string): string {
	const name = readableMediaName(showTitle);
	const segs = folderSegmentsForType(settings, "show");
	return pathUnderMedia(settings, ...segs, name, `${name}.md`);
}

export function vaultPathForPodcastShowNote(settings: ReposeSettings, showTitle: string): string {
	const name = readableMediaName(showTitle);
	const segs = folderSegmentsForType(settings, "podcast");
	return pathUnderMedia(settings, ...segs, name, `${name}.md`);
}

export async function lookupShowInVault(
	vault: Vault,
	settings: ReposeSettings,
	showTitle: string,
): Promise<{ found: boolean; path?: string }> {
	const path = vaultPathForShowNote(settings, showTitle);
	const f = vault.getAbstractFileByPath(path);
	return f ? { found: true, path } : { found: false };
}

async function mergeTraktAndTmdbArt(
	settings: ReposeSettings,
	itemData: TraktShowOrMovie,
	type: "movie" | "show",
	tmdbImages: {
		poster?: string | null;
		posterLarge?: string | null;
		backdrop?: string | null;
		backdropLarge?: string | null;
		logo?: string | null;
	} | null,
): Promise<{
	poster: string | null;
	banner: string | null;
	logo: string | null;
	thumb: string | null;
}> {
	let poster: string | null = null;
	let banner: string | null = null;
	let logo: string | null = null;
	let thumb: string | null = null;
	let fanart: string | null = null;

	const cid = settings.traktClientId.trim();
	const traktId = itemData.ids?.trakt;
	if (cid && traktId != null) {
		const a = await getTraktArtUrls(cid, type, traktId);
		if (a) {
			poster = a.poster;
			banner = a.banner;
			logo = a.logo;
			thumb = a.thumb;
			fanart = a.fanart;
		}
	}

	const tp = tmdbImages?.posterLarge ?? tmdbImages?.poster ?? null;
	const tb = tmdbImages?.backdropLarge ?? tmdbImages?.backdrop ?? null;
	const tLogo = tmdbImages?.logo ?? null;
	if (!poster) poster = tp;
	// Trakt “fanart” is scenic wallpaper; TMDB backdrop is usually a better hero image.
	if (!banner) banner = tb;
	if (!banner && fanart) banner = fanart;
	if (!logo) logo = tLogo;

	return { poster, banner, logo, thumb };
}

export async function addTraktShowOrMovieToVault(
	vault: Vault,
	settings: ReposeSettings,
	itemData: TraktShowOrMovie,
	type: "movie" | "show",
	images: {
		poster?: string | null;
		posterLarge?: string | null;
		backdrop?: string | null;
		backdropLarge?: string | null;
	} | null,
	tokenStore?: TraktSettingsStore,
): Promise<{ path: string }> {
	const frontmatter = traktToObsidianFrontmatter(itemData, type, {}, settings.projectWikilink);

	if (type === "movie" && tokenStore && itemData.ids?.trakt != null) {
		const watchedMovies = await fetchWatchedMoviesMap(tokenStore);
		const d = watchedMovies?.get(itemData.ids.trakt);
		if (d) {
			frontmatter.watchedDate = d;
			frontmatter.reposeStatus = "watched";
		}
	}

	let content = "";

	if (type === "show" && itemData.title) {
		content += `![[Series.base#${itemData.title}]]\n\n`;
	}

	const metadataLines: string[] = [];
	if (itemData.status) metadataLines.push(`**Status:** ${itemData.status.replace("_", " ")}`);
	if (itemData.network) metadataLines.push(`**Network:** ${itemData.network}`);
	if (itemData.runtime) metadataLines.push(`**Runtime:** ${itemData.runtime} minutes`);
	if (itemData.rating != null) metadataLines.push(`**Rating:** ${itemData.rating.toFixed(1)}/10`);

	if (metadataLines.length > 0) content += metadataLines.join(" • ") + "\n\n";

	if (itemData.ids) {
		const idLines: string[] = [];
		if (itemData.ids.imdb) idLines.push(`**IMDB:** ${itemData.ids.imdb}`);
		if (itemData.ids.tmdb != null) idLines.push(`**TMDB:** ${itemData.ids.tmdb}`);
		if (itemData.ids.trakt != null) idLines.push(`**Trakt:** ${itemData.ids.trakt}`);
		if (itemData.ids.tvdb != null) idLines.push(`**TVDB:** ${itemData.ids.tvdb}`);
		if (idLines.length > 0) content += idLines.join("\n") + "\n\n";
	}

	if (itemData.overview) content += `## Overview\n\n${itemData.overview}\n\n`;

	const title = itemData.title || "untitled";
	let relativePath: string;

	if (type === "movie") {
		const readableTitle = readableMediaName(title);
		const segs = folderSegmentsForType(settings, "movie");
		relativePath = pathUnderMedia(settings, ...segs, readableTitle, `${readableTitle}.md`);
	} else {
		const readableShowName = readableMediaName(title);
		const segs = folderSegmentsForType(settings, "show");
		relativePath = pathUnderMedia(settings, ...segs, readableShowName, `${readableShowName}.md`);
	}

	const artUrls = await mergeTraktAndTmdbArt(settings, itemData, type, images);
	const artPaths = await downloadTraktArtToNoteFolder(vault, relativePath, artUrls);

	const md = stringifyNote(frontmatter, content, {
		banner: artPaths.banner,
		poster: artPaths.poster,
		logo: artPaths.logo,
	});
	await writeMarkdownFile(vault, relativePath, md);
	return { path: relativePath };
}

export async function addTraktEpisodeToVault(
	vault: Vault,
	settings: ReposeSettings,
	episodeData: TraktEpisode,
	showData: TraktShowOrMovie,
	episodeStillUrl: string | null,
	tokenStore?: TraktSettingsStore,
	/** When provided (including null), skips fetching; use for batch imports after one progress call. */
	cachedShowProgress?: ShowWatchedProgress | null,
): Promise<{ path: string }> {
	const images = episodeStillUrl ? { episodeStill: episodeStillUrl } : null;

	const frontmatter = traktToObsidianFrontmatter(episodeData, "episode", {}, settings.projectWikilink);

	if (showData.ids?.trakt != null && episodeData.season != null && episodeData.number != null) {
		let progress: ShowWatchedProgress | null = null;
		if (cachedShowProgress !== undefined) {
			progress = cachedShowProgress;
		} else if (tokenStore) {
			progress = await fetchShowWatchedProgress(tokenStore, showData.ids.trakt);
		}
		if (progress) {
			applyEpisodeWatchedFromTraktProgress(
				frontmatter,
				episodeData.season,
				episodeData.number,
				progress,
			);
		}
	}

	if (showData.title) {
		const readableShowName = readableMediaName(showData.title);
		frontmatter.showTitle = `[[${readableShowName}]]`;
	}

	const showTitleForImages = showData.title || "Episode";
	const imagePaths = await downloadObsidianImages(vault, images, showTitleForImages, {
		showName: showData.title ?? null,
		season: episodeData.season,
		episode: episodeData.number,
	});

	let content = "";
	if (episodeData.overview) content += `${episodeData.overview}\n\n`;

	const metadataLines: string[] = [];
	if (showData.title) metadataLines.push(`**Show:** ${showData.title}`);
	if (episodeData.season != null && episodeData.number != null) {
		metadataLines.push(
			`**Episode:** S${String(episodeData.season).padStart(2, "0")}E${String(episodeData.number).padStart(2, "0")}`,
		);
	}
	const fa = episodeData.firstAired ?? episodeData.first_aired;
	if (fa) metadataLines.push(`**Air Date:** ${new Date(fa).toLocaleDateString()}`);
	if (episodeData.runtime != null) metadataLines.push(`**Runtime:** ${episodeData.runtime} minutes`);
	if (episodeData.rating != null) metadataLines.push(`**Rating:** ${episodeData.rating.toFixed(1)}/10`);

	if (metadataLines.length > 0) content += metadataLines.join("\n") + "\n\n";

	if (episodeData.ids) {
		const idLines: string[] = [];
		if (episodeData.ids.imdb) idLines.push(`**IMDB:** ${episodeData.ids.imdb}`);
		if (episodeData.ids.tmdb != null) idLines.push(`**TMDB:** ${episodeData.ids.tmdb}`);
		if (episodeData.ids.trakt != null) idLines.push(`**Trakt:** ${episodeData.ids.trakt}`);
		if (episodeData.ids.tvdb != null) idLines.push(`**TVDB:** ${episodeData.ids.tvdb}`);
		if (idLines.length > 0) content += idLines.join("\n") + "\n\n";
	}

	const season = episodeData.season ?? 0;
	const episode = episodeData.number ?? 0;
	const episodeTitleText = episodeData.title || `Episode ${episodeData.number}`;
	const sanitizedEpisodeTitle = episodeTitleText
		.replace(/[^\w\s]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	const filename = `${season}x${String(episode).padStart(2, "0")} ${sanitizedEpisodeTitle}.md`;

	const readableShowName = readableMediaName(showData.title || "");
	const showSegs = folderSegmentsForType(settings, "show");
	const relativePath = pathUnderMedia(settings, ...showSegs, readableShowName, filename);

	const md = stringifyNote(frontmatter, content, { banner: imagePaths.banner });
	await writeMarkdownFile(vault, relativePath, md);
	return { path: relativePath };
}

export async function addIgdbGameToVault(vault: Vault, settings: ReposeSettings, game: IgdbGame): Promise<{ path: string }> {
	const genres = normalizeGenres(game);
	const frontmatter = igdbGameToObsidianFrontmatter(game, genres);
	const title = game.name || "untitled";
	const readableTitle = readableMediaName(title);
	const segs = folderSegmentsForType(settings, "game");
	const relativePath = pathUnderMedia(settings, ...segs, readableTitle, `${readableTitle}.md`);

	const { poster, banner } = artUrlsForIgdbGame(game);
	const artPaths = await downloadTraktArtToNoteFolder(vault, relativePath, {
		poster,
		banner,
		logo: null,
		thumb: poster,
	});

	const r10 =
		game.rating != null && Number.isFinite(game.rating)
			? game.rating
			: game.total_rating != null && Number.isFinite(game.total_rating)
				? game.total_rating / 10
				: null;

	let content = "";
	const metadataLines: string[] = [];
	if (r10 != null) metadataLines.push(`**Rating:** ${r10.toFixed(1)}/10`);
	if (metadataLines.length > 0) content += metadataLines.join(" • ") + "\n\n";

	const idLines: string[] = [];
	if (game.id != null) idLines.push(`**IGDB:** ${game.id}`);
	if (idLines.length > 0) content += idLines.join("\n") + "\n\n";

	if (game.summary) content += `## Overview\n\n${game.summary}\n\n`;

	const md = stringifyNote(frontmatter, content, {
		banner: artPaths.banner,
		poster: artPaths.poster,
		logo: artPaths.logo,
	});
	await writeMarkdownFile(vault, relativePath, md);
	return { path: relativePath };
}

export async function fetchImagesForItem(
	tmdbApiKey: string,
	tmdbId: number | undefined,
	type: "movie" | "show",
): Promise<{
	poster?: string | null;
	posterLarge?: string | null;
	backdrop?: string | null;
	backdropLarge?: string | null;
	logo?: string | null;
} | null> {
	if (!tmdbId || !tmdbApiKey.trim()) return null;
	return getTMDBImages(tmdbId, type, tmdbApiKey);
}

export async function fetchEpisodeStill(
	tmdbApiKey: string,
	showTmdbId: number | undefined,
	season: number,
	episode: number,
): Promise<string | null> {
	if (!showTmdbId || !tmdbApiKey.trim()) return null;
	return getTMDBEpisodeImage(showTmdbId, season, episode, tmdbApiKey);
}
