import matter from "gray-matter";
import { normalizePath, requestUrl, TFile, type Vault } from "obsidian";

/** Match Noma server: readable names for paths */
export function readableMediaName(title: string): string {
	return title
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function sanitizeFilename(filename: string): string {
	return filename
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.substring(0, 100);
}

function getExtension(url: string): string {
	const cleanUrl = url.split("?")[0];
	const m = /\.([a-z0-9]+)$/i.exec(cleanUrl);
	return m ? `.${m[1].toLowerCase()}` : ".jpg";
}

export interface TraktLikeIds {
	trakt?: number;
	imdb?: string;
	tmdb?: number;
	tvdb?: number;
}

export interface TraktShowOrMovie {
	title?: string;
	year?: number;
	overview?: string;
	rating?: number;
	runtime?: number;
	released?: string;
	first_aired?: string;
	firstAired?: string;
	genres?: string[];
	status?: string;
	network?: string;
	certification?: string;
	ids?: TraktLikeIds;
}

export interface TraktEpisode extends TraktShowOrMovie {
	season?: number;
	number?: number;
}

export function traktToObsidianFrontmatter(
	itemData: TraktShowOrMovie | TraktEpisode,
	type: "movie" | "show" | "episode",
	metadata: { rating?: number; watchedAt?: string; status?: string } = {},
	projectWikilink: string,
): Record<string, unknown> {
	const frontmatter: Record<string, unknown> = {};

	if (itemData.title) frontmatter.title = itemData.title;

	frontmatter.type = type === "movie" ? "Movie" : type === "show" ? "TV Show" : "Episode";

	const today = new Date();
	frontmatter.date = today.toISOString().split("T")[0];

	if (itemData.year) frontmatter.year = itemData.year;

	if (itemData.overview) frontmatter.description = itemData.overview;

	if (metadata.rating != null) frontmatter.rating = metadata.rating;
	else if (itemData.rating != null) frontmatter.rating = Math.round(itemData.rating * 10) / 10;

	if (itemData.genres && itemData.genres.length > 0) frontmatter.genres = itemData.genres;

	if (itemData.runtime) frontmatter.runtime = itemData.runtime;

	if (itemData.released) frontmatter.releaseDate = itemData.released;
	else if (itemData.first_aired) frontmatter.releaseDate = itemData.first_aired.split("T")[0];
	else if (itemData.firstAired) frontmatter.releaseDate = itemData.firstAired.split("T")[0];

	if (metadata.watchedAt) frontmatter.watchedDate = metadata.watchedAt.split("T")[0];

	if (metadata.status) frontmatter.status = metadata.status;

	const ids = itemData.ids;
	if (ids) {
		if (ids.trakt != null) frontmatter.traktId = ids.trakt;
		if (ids.imdb) frontmatter.imdbId = ids.imdb;
		if (ids.tmdb != null) frontmatter.tmdbId = ids.tmdb;
		if (ids.tvdb != null) frontmatter.tvdbId = ids.tvdb;
	}

	if (type === "episode") {
		const ep = itemData as TraktEpisode;
		if (ep.season != null) frontmatter.season = ep.season;
		if (ep.number != null) frontmatter.episode = ep.number;
		const fa = ep.firstAired ?? ep.first_aired;
		if (fa) frontmatter.airDate = fa.split("T")[0];
	}

	if (type === "show") {
		const show = itemData as TraktShowOrMovie;
		if (show.status) frontmatter.showStatus = show.status.replace("_", " ");
		if (show.network) frontmatter.network = show.network;
	}

	if (itemData.certification) frontmatter.certification = itemData.certification;

	if (type === "show" || type === "episode") {
		frontmatter.project = projectWikilink;
	}

	return frontmatter;
}

async function ensureFolder(vault: Vault, dirPath: string): Promise<void> {
	const normalized = normalizePath(dirPath);
	if (vault.getAbstractFileByPath(normalized)) return;
	const parent = normalized.split("/").slice(0, -1).join("/");
	if (parent) await ensureFolder(vault, parent);
	await vault.createFolder(normalized);
}

async function downloadToVaultPath(vault: Vault, url: string, vaultRelativePath: string): Promise<void> {
	const res = await requestUrl({ url });
	if (res.status >= 400) throw new Error(`HTTP ${res.status} for image`);
	const buf = res.arrayBuffer;
	const norm = normalizePath(vaultRelativePath);
	const existing = vault.getAbstractFileByPath(norm);
	if (existing instanceof TFile) {
		await vault.modifyBinary(existing, buf);
	} else {
		await vault.createBinary(norm, buf);
	}
}

export interface ImageDownloadResult {
	banner: string | null;
	poster: string | null;
}

/**
 * Download poster/backdrop/still into vault/attachments/{noteTitle}/
 */
export async function downloadObsidianImages(
	vault: Vault,
	images: { poster?: string | null; backdrop?: string | null; episodeStill?: string | null } | null,
	noteTitle: string,
	episodeMeta?: { showName: string | null; season: number | undefined; episode: number | undefined },
): Promise<ImageDownloadResult> {
	const results: ImageDownloadResult = { banner: null, poster: null };
	if (!images) return results;

	const attachmentsDir = `attachments/${sanitizeFilename(noteTitle)}`;
	await ensureFolder(vault, attachmentsDir);

	if (images.backdrop) {
		try {
			const ext = getExtension(images.backdrop);
			const filename = `banner${ext}`;
			const rel = `${attachmentsDir}/${filename}`;
			await downloadToVaultPath(vault, images.backdrop, rel);
			results.banner = rel;
		} catch (e) {
			console.error("[Repose] banner download:", e);
		}
	}

	if (images.poster) {
		try {
			const ext = getExtension(images.poster);
			const filename = `poster${ext}`;
			const rel = `${attachmentsDir}/${filename}`;
			await downloadToVaultPath(vault, images.poster, rel);
			results.poster = rel;
		} catch (e) {
			console.error("[Repose] poster download:", e);
		}
	}

	if (images.episodeStill) {
		try {
			const ext = getExtension(images.episodeStill);
			let filename: string;
			if (
				episodeMeta?.showName &&
				episodeMeta.season !== undefined &&
				episodeMeta.episode !== undefined
			) {
				const sn = sanitizeFilename(episodeMeta.showName);
				filename = `${sn}-${episodeMeta.season}-${episodeMeta.episode}${ext}`;
			} else {
				filename = `episode-still${ext}`;
			}
			const rel = `${attachmentsDir}/${filename}`;
			await downloadToVaultPath(vault, images.episodeStill, rel);
			results.banner = rel;
		} catch (e) {
			console.error("[Repose] episode still download:", e);
		}
	}

	return results;
}

export function stringifyNote(
	frontmatter: Record<string, unknown>,
	content: string,
	bannerVaultPath: string | null,
): string {
	const fm = { ...frontmatter };
	if (bannerVaultPath) {
		fm.banner = `[[${bannerVaultPath}]]`;
	}
	return matter.stringify(content || "", fm);
}

export async function writeMarkdownFile(vault: Vault, relativePath: string, body: string): Promise<void> {
	const norm = normalizePath(relativePath);
	const dir = norm.split("/").slice(0, -1).join("/");
	if (dir) await ensureFolder(vault, dir);
	const existing = vault.getAbstractFileByPath(norm);
	if (existing instanceof TFile) {
		await vault.modify(existing, body);
	} else {
		await vault.create(norm, body);
	}
}
