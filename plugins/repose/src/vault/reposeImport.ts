import { normalizePath, type TFile, type Vault } from "obsidian";
import { getTMDBEpisodeImage, getTMDBImages, getTraktArtUrls } from "../trakt/client";
import {
	applyEpisodeWatchFieldsFromTrakt,
	calendarDateFromLatestWatchedIsos,
	fetchEpisodeWatchHistoryIsos,
	fetchMovieWatchHistoryIsos,
	fetchShowWatchedProgress,
	fetchWatchedMoviesMap,
	type ShowWatchedProgress,
	type TraktSettingsStore,
} from "../trakt/watchedSync";
import { artUrlsForIgdbGame, normalizeGenres, type IgdbGame } from "../igdb/client";
import {
	coverUrlForOlSearchDoc,
	coverUrlForOlWork,
	type OlSearchDoc,
} from "../openlibrary/client";
import { folderSegmentsForType, type ReposeSettings } from "../settings";
import {
	downloadObsidianImages,
	downloadTraktArtToNoteFolder,
	igdbGameToObsidianFrontmatter,
	openLibraryBookToObsidianFrontmatter,
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

/**
 * Vault path for a movie note the same way as {@link addTraktShowOrMovieToVault}:
 * `{mediaRoot}/{movie folder…}/{readableTitle}/{readableTitle}.md`.
 * Use this (not the current file path) when downloading art so images always live under
 * `…/MovieTitle/images/…` even if the note file is still a legacy `Movies/Title.md`.
 */
export function canonicalMovieNotePath(settings: ReposeSettings, movieTitle: string): string {
	const readableTitle = readableMediaName(movieTitle || "untitled");
	const segs = folderSegmentsForType(settings, "movie");
	return pathUnderMedia(settings, ...segs, readableTitle, `${readableTitle}.md`);
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

export async function mergeTraktAndTmdbArt(
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
		const hist = await fetchMovieWatchHistoryIsos(tokenStore, itemData.ids.trakt);
		if (hist !== null && hist.length > 0) {
			frontmatter.watchedDates = [...hist];
			const cal = calendarDateFromLatestWatchedIsos(hist);
			if (cal) frontmatter.watchedDate = cal;
			frontmatter.reposeStatus = "watched";
		} else {
			const watchedMovies = await fetchWatchedMoviesMap(tokenStore);
			const d = watchedMovies?.get(itemData.ids.trakt);
			if (d) {
				frontmatter.watchedDate = d;
				frontmatter.reposeStatus = "watched";
			}
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
		let hist: string[] | null = null;
		const epTid = episodeData.ids?.trakt;
		if (tokenStore && typeof epTid === "number" && Number.isFinite(epTid)) {
			hist = await fetchEpisodeWatchHistoryIsos(tokenStore, epTid);
		}
		if (progress != null || hist !== null) {
			applyEpisodeWatchFieldsFromTrakt(
				frontmatter,
				episodeData.season,
				episodeData.number,
				progress,
				hist,
				null,
				null,
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

/**
 * Same as {@link addTraktEpisodeToVault}, but writes the episode note next to an existing bundle note
 * (`Show/Show.md`) instead of inferring the folder from media settings alone.
 */
export async function addTraktEpisodeNextToShowBundle(
	vault: Vault,
	settings: ReposeSettings,
	showFile: TFile,
	episodeData: TraktEpisode,
	showData: TraktShowOrMovie,
	episodeStillUrl: string | null,
	tokenStore?: TraktSettingsStore,
	cachedShowProgress?: ShowWatchedProgress | null,
): Promise<{ path: string }> {
	const parent = showFile.parent;
	if (!parent) throw new Error("Show note has no parent folder.");

	const images = episodeStillUrl ? { episodeStill: episodeStillUrl } : null;

	const frontmatter = traktToObsidianFrontmatter(episodeData, "episode", {}, settings.projectWikilink);

	if (showData.ids?.trakt != null && episodeData.season != null && episodeData.number != null) {
		let progress: ShowWatchedProgress | null = null;
		if (cachedShowProgress !== undefined) {
			progress = cachedShowProgress;
		} else if (tokenStore) {
			progress = await fetchShowWatchedProgress(tokenStore, showData.ids.trakt);
		}
		let hist: string[] | null = null;
		const epTid = episodeData.ids?.trakt;
		if (tokenStore && typeof epTid === "number" && Number.isFinite(epTid)) {
			hist = await fetchEpisodeWatchHistoryIsos(tokenStore, epTid);
		}
		if (progress != null || hist != null) {
			applyEpisodeWatchFieldsFromTrakt(
				frontmatter,
				episodeData.season,
				episodeData.number,
				progress,
				hist,
				null,
				null,
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

	const relativePath = normalizePath(`${parent.path}/${filename}`);
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

export async function addOpenLibraryBookToVault(
	vault: Vault,
	settings: ReposeSettings,
	doc: OlSearchDoc,
	work: Record<string, unknown> | null,
): Promise<{ path: string }> {
	const frontmatter = openLibraryBookToObsidianFrontmatter(doc, work);
	const title = String(frontmatter.title ?? "untitled");
	const readableTitle = readableMediaName(title);
	const segs = folderSegmentsForType(settings, "book");
	const relativePath = pathUnderMedia(settings, ...segs, readableTitle, `${readableTitle}.md`);

	const posterUrl = coverUrlForOlSearchDoc(doc, "L") ?? coverUrlForOlWork(work, "L");
	const artPaths = await downloadTraktArtToNoteFolder(vault, relativePath, {
		poster: posterUrl,
		banner: null,
		logo: null,
		thumb: posterUrl,
	});

	const authors = frontmatter.authors;
	const authorLine =
		Array.isArray(authors) && authors.length > 0
			? `**Authors:** ${authors.map((a) => String(a)).join(", ")}`
			: null;
	const y = frontmatter.year;
	const yearLine = typeof y === "number" && Number.isFinite(y) ? `**First published:** ${y}` : null;
	const isbn = frontmatter.isbn;
	const isbnLine = typeof isbn === "string" && isbn.trim() ? `**ISBN:** ${isbn.trim()}` : null;

	let content = "";
	const metaLines = [authorLine, yearLine, isbnLine].filter(Boolean) as string[];
	if (metaLines.length > 0) content += metaLines.join(" • ") + "\n\n";

	const desc = frontmatter.description;
	if (typeof desc === "string" && desc.trim()) {
		content += `## Overview\n\n${desc.trim()}\n\n`;
	}

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
