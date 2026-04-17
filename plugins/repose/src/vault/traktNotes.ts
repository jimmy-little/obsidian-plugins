import matter from "gray-matter";
import { normalizePath, requestUrl, TFile, type Vault } from "obsidian";
import type { OlSearchDoc } from "../openlibrary/client";
import {
	extractOlDescription,
	extractOlSubjectStrings,
	extractYearFromOlWork,
	parseOpenLibraryWorkId,
	pickPrimaryIsbn,
} from "../openlibrary/client";

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

/** IGDB game note — uses the same keys as Trakt/TMDB imports (`description`, `banner`/`poster` wikilinks via stringifyNote, `releaseDate`, `rating`, `genres`). */
export function igdbGameToObsidianFrontmatter(
	game: { id: number; name?: string; summary?: string; first_release_date?: number; rating?: number; total_rating?: number },
	genreNames: string[],
): Record<string, unknown> {
	const frontmatter: Record<string, unknown> = {};
	if (game.name) frontmatter.title = game.name;
	frontmatter.type = "Video Game";
	frontmatter.mediaType = "game";
	const today = new Date();
	frontmatter.date = today.toISOString().split("T")[0];

	if (game.summary) frontmatter.description = game.summary;

	/* IGDB `rating` is 0–10; `total_rating` is 0–100 — store ~Trakt-style /10 in YAML. */
	const r10 =
		game.rating != null && Number.isFinite(game.rating)
			? game.rating
			: game.total_rating != null && Number.isFinite(game.total_rating)
				? game.total_rating / 10
				: null;
	if (r10 != null) frontmatter.rating = Math.round(r10 * 10) / 10;

	if (typeof game.first_release_date === "number" && game.first_release_date > 0) {
		frontmatter.releaseDate = new Date(game.first_release_date * 1000).toISOString().split("T")[0];
	}

	if (genreNames.length > 0) frontmatter.genres = genreNames;

	frontmatter.igdbId = game.id;

	return frontmatter;
}

/** Open Library book note — aligns with other imports (`mediaType`, `description`, cover via `stringifyNote`). */
export function openLibraryBookToObsidianFrontmatter(
	doc: OlSearchDoc,
	work: Record<string, unknown> | null,
): Record<string, unknown> {
	const frontmatter: Record<string, unknown> = {};
	const titleFromWork = work && typeof work.title === "string" ? work.title.trim() : "";
	const title = (doc.title?.trim() || titleFromWork || "Untitled").trim();
	frontmatter.title = title;
	frontmatter.type = "Book";
	frontmatter.mediaType = "book";
	const today = new Date();
	frontmatter.date = today.toISOString().split("T")[0];

	if (doc.author_name && doc.author_name.length > 0) {
		frontmatter.authors = doc.author_name.map((a) => String(a).trim()).filter(Boolean);
	}

	const y = doc.first_publish_year ?? extractYearFromOlWork(work);
	if (y != null && Number.isFinite(y)) {
		frontmatter.year = y;
		frontmatter.releaseDate = `${y}-01-01`;
	}

	const desc = extractOlDescription(work);
	if (desc) frontmatter.description = desc;

	const subjects = extractOlSubjectStrings(work);
	if (subjects.length > 0) frontmatter.genres = subjects.slice(0, 16);

	const isbn = pickPrimaryIsbn(doc);
	if (isbn) frontmatter.isbn = isbn;

	const wk = parseOpenLibraryWorkId(doc.key);
	if (wk) frontmatter.openLibraryWorkKey = wk;

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

export interface NoteFolderArtResult {
	poster: string | null;
	banner: string | null;
	logo: string | null;
	thumb: string | null;
}

/**
 * Download Trakt/TMDB art into `{parent-of-note}/images/{note-stem}/` (poster, banner, logo, thumb).
 * The per-note folder avoids collisions when several notes share one parent (e.g. flat `Games/*.md`).
 */
export async function downloadTraktArtToNoteFolder(
	vault: Vault,
	noteMdPath: string,
	urls: {
		poster?: string | null;
		banner?: string | null;
		logo?: string | null;
		thumb?: string | null;
	},
): Promise<NoteFolderArtResult> {
	const result: NoteFolderArtResult = { poster: null, banner: null, logo: null, thumb: null };
	const norm = normalizePath(noteMdPath);
	const parts = norm.split("/");
	if (parts.length < 2) return result;
	const parent = parts.slice(0, -1).join("/");
	const fileName = parts[parts.length - 1] ?? "";
	const noteStem = fileName.replace(/\.md$/i, "");
	const noteKey = sanitizeFilename(noteStem) || "note";
	const imagesDir = normalizePath(`${parent}/images/${noteKey}`);
	await ensureFolder(vault, imagesDir);

	const save = async (slot: keyof NoteFolderArtResult, url: string | null | undefined): Promise<void> => {
		if (!url || !/^https?:\/\//i.test(url)) return;
		try {
			const ext = getExtension(url);
			const filename = `${String(slot)}${ext}`;
			const rel = normalizePath(`${imagesDir}/${filename}`);
			await downloadToVaultPath(vault, url, rel);
			result[slot] = rel;
		} catch (e) {
			console.error(`[Repose] ${String(slot)} download:`, e);
		}
	};

	await save("poster", urls.poster);
	await save("banner", urls.banner);
	await save("logo", urls.logo);
	await save("thumb", urls.thumb);
	return result;
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
	imagePaths: { banner?: string | null; poster?: string | null; logo?: string | null } = {},
): string {
	const fm = { ...frontmatter };
	if (imagePaths.banner) fm.banner = `[[${imagePaths.banner}]]`;
	if (imagePaths.poster) fm.poster = `[[${imagePaths.poster}]]`;
	if (imagePaths.logo) fm.logo = `[[${imagePaths.logo}]]`;
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
