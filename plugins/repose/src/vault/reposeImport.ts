import { normalizePath, type Vault } from "obsidian";
import { getTMDBEpisodeImage, getTMDBImages } from "../trakt/client";
import type { ReposeSettings } from "../settings";
import {
	downloadObsidianImages,
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

export function vaultPathForShowNote(settings: ReposeSettings, showTitle: string): string {
	const name = readableMediaName(showTitle);
	return normalizePath(`${mediaBase(settings)}/${settings.seriesSubfolder}/${name}/${name}.md`);
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
): Promise<{ path: string }> {
	const frontmatter = traktToObsidianFrontmatter(itemData, type, {}, settings.projectWikilink);

	const imagesToDownload = {
		poster: images?.posterLarge || images?.poster || null,
		backdrop: images?.backdropLarge || images?.backdrop || null,
	};

	const imagePaths = await downloadObsidianImages(
		vault,
		imagesToDownload,
		itemData.title || "untitled",
	);

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
		relativePath = normalizePath(`${mediaBase(settings)}/${settings.moviesSubfolder}/${readableTitle}.md`);
	} else {
		const readableShowName = readableMediaName(title);
		relativePath = normalizePath(
			`${mediaBase(settings)}/${settings.seriesSubfolder}/${readableShowName}/${readableShowName}.md`,
		);
	}

	const md = stringifyNote(frontmatter, content, imagePaths.banner);
	await writeMarkdownFile(vault, relativePath, md);
	return { path: relativePath };
}

export async function addTraktEpisodeToVault(
	vault: Vault,
	settings: ReposeSettings,
	episodeData: TraktEpisode,
	showData: TraktShowOrMovie,
	episodeStillUrl: string | null,
): Promise<{ path: string }> {
	const images = episodeStillUrl ? { episodeStill: episodeStillUrl } : null;

	const frontmatter = traktToObsidianFrontmatter(episodeData, "episode", {}, settings.projectWikilink);

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
	const relativePath = normalizePath(
		`${mediaBase(settings)}/${settings.seriesSubfolder}/${readableShowName}/${filename}`,
	);

	const md = stringifyNote(frontmatter, content, imagePaths.banner);
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
