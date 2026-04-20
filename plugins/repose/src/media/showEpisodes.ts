import { type App, TFile } from "obsidian";
import type { ReposeSettings } from "../settings";
import { resolveMediaTypeForFile } from "./mediaDetect";
import {
	type ReposeStatus,
	isEffectivelyWatchedFromFrontmatter,
	titleFromFrontmatterOrFile,
	watchedDateFromFrontmatter,
	watchedPlayDatesCardPreview,
} from "./mediaModel";

export type EpisodeRow = {
	path: string;
	title: string;
	description: string;
	airDate: string;
	watchedDate?: string;
	/** Up to 3 calendar labels for list cards (newest plays first). */
	watchedDatesCard: string[];
	season?: number;
	episode?: number;
};

const EPISODE_FILENAME = /^(\d+)x(\d+)/i;

/** YAML often yields strings (e.g. `episode: "06"`); Trakt sync needs numeric season/episode. */
function intFromFrontmatter(val: unknown): number | undefined {
	if (typeof val === "number" && Number.isFinite(val)) return Math.trunc(val);
	if (typeof val === "string") {
		const n = parseInt(val.trim(), 10);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}

function isEpisodeLikeFile(app: App, file: TFile, showBasename: string): boolean {
	if (file.basename === showBasename) return false;
	const cache = app.metadataCache.getFileCache(file);
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	const t = typeof fm.type === "string" ? fm.type.trim().toLowerCase() : "";
	const mt = typeof fm.mediaType === "string" ? fm.mediaType.trim().toLowerCase() : "";
	if (t === "episode" || mt === "episode") return true;
	return EPISODE_FILENAME.test(file.basename);
}

/**
 * Episode notes live in the same folder as the series note (`Series/ShowName/ShowName.md`).
 * Podcasts use the same layout: every markdown file in the folder except `ShowName.md` is an episode.
 */
export function collectEpisodeNoteFiles(app: App, showFile: TFile, settings: ReposeSettings): TFile[] {
	const folder = showFile.parent;
	if (!folder) return [];
	const showBase = showFile.basename;
	const hostMt = resolveMediaTypeForFile(app, showFile, settings);
	const podcastOrBookLayout = hostMt === "podcast" || hostMt === "book";
	const out: TFile[] = [];
	for (const child of folder.children) {
		if (!(child instanceof TFile)) continue;
		if (child.extension !== "md") continue;
		if (child.path === showFile.path) continue;
		if (!podcastOrBookLayout && !isEpisodeLikeFile(app, child, showBase)) continue;
		/** Flat folders (many bundle notes in one directory): skip sibling books / podcasts as "chapters". */
		if (podcastOrBookLayout) {
			const childMt = resolveMediaTypeForFile(app, child, settings);
			if (hostMt === "book" && childMt === "book") continue;
			if (hostMt === "podcast" && childMt === "podcast") continue;
		}
		out.push(child);
	}
	out.sort((a, b) => {
		const ra = readEpisodeRow(app, a);
		const rb = readEpisodeRow(app, b);
		const sa = ra.season ?? 0;
		const sb = rb.season ?? 0;
		if (sa !== sb) return sa - sb;
		const ea = ra.episode ?? 0;
		const eb = rb.episode ?? 0;
		if (ea !== eb) return ea - eb;
		return a.basename.localeCompare(b.basename, undefined, { sensitivity: "base" });
	});
	return out;
}

/**
 * First unwatched episode note in vault order; if every episode is watched, the last episode note.
 * Used for dashboard “next” still / TMDB lookup.
 */
export function findNextOrLastEpisodeNote(
	app: App,
	showFile: TFile,
	settings: ReposeSettings,
): TFile | null {
	const files = collectEpisodeNoteFiles(app, showFile, settings);
	if (files.length === 0) return null;
	for (const f of files) {
		const fm = (app.metadataCache.getFileCache(f)?.frontmatter ?? {}) as Record<string, unknown>;
		if (!isEffectivelyWatchedFromFrontmatter(fm)) return f;
	}
	return files[files.length - 1] ?? null;
}

/** First episode note in vault order that is not watched; `null` if every episode is watched. */
export function findFirstUnwatchedEpisodeNote(
	app: App,
	showFile: TFile,
	settings: ReposeSettings,
): TFile | null {
	const files = collectEpisodeNoteFiles(app, showFile, settings);
	for (const f of files) {
		const fm = (app.metadataCache.getFileCache(f)?.frontmatter ?? {}) as Record<string, unknown>;
		if (!isEffectivelyWatchedFromFrontmatter(fm)) return f;
	}
	return null;
}

export function readEpisodeRow(app: App, file: TFile): EpisodeRow {
	const cache = app.metadataCache.getFileCache(file);
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	const title = titleFromFrontmatterOrFile(fm, file);
	let description = "";
	if (typeof fm.description === "string") description = fm.description;
	else if (typeof fm.overview === "string") description = fm.overview;

	const dateKeys = ["episode_publish_date", "date", "airDate", "releaseDate"] as const;
	let airDate = "";
	for (const k of dateKeys) {
		const v = fm[k];
		if (typeof v === "string" && v.trim()) {
			airDate = v.trim();
			break;
		}
	}

	let season: number | undefined = intFromFrontmatter(fm.season);
	let episode: number | undefined = intFromFrontmatter(fm.episode);

	const m = EPISODE_FILENAME.exec(file.basename);
	if (m) {
		if (season === undefined) season = parseInt(m[1], 10);
		if (episode === undefined) episode = parseInt(m[2], 10);
	}

	return {
		path: file.path,
		title,
		description,
		airDate,
		watchedDate: watchedDateFromFrontmatter(fm),
		watchedDatesCard: watchedPlayDatesCardPreview(fm, 3),
		season,
		episode,
	};
}

/** Distinct season numbers and total episode notes under the series folder. */
export function countShowSeasonsAndEpisodes(app: App, showFile: TFile, settings: ReposeSettings): {
	seasonCount: number;
	episodeCount: number;
} {
	const files = collectEpisodeNoteFiles(app, showFile, settings);
	const seasons = new Set<number>();
	for (const f of files) {
		const row = readEpisodeRow(app, f);
		if (row.season != null) seasons.add(row.season);
	}
	return { seasonCount: seasons.size, episodeCount: files.length };
}

/** Watched vs total episode notes (vault frontmatter), for sidebar progress and hero stats. */
export function showEpisodeWatchProgress(
	app: App,
	showFile: TFile,
	settings: ReposeSettings,
): { watched: number; total: number } {
	const files = collectEpisodeNoteFiles(app, showFile, settings);
	let watched = 0;
	for (const f of files) {
		const fm = (app.metadataCache.getFileCache(f)?.frontmatter ?? {}) as Record<string, unknown>;
		if (isEffectivelyWatchedFromFrontmatter(fm)) watched++;
	}
	return { watched, total: files.length };
}

/**
 * Sidebar / show hero: vault progress + optional series-note `reposeStatus`.
 * — DONE: series note `reposeStatus` / status is `watched`
 * — NOT STARTED: no episode notes, or none marked watched
 * — WATCHING: some but not all episode notes watched
 * — CAUGHT UP: every episode note in the folder is watched
 */
export function personalSerialWatchBadgeLabel(
	watched: number,
	total: number,
	seriesReposeStatus?: ReposeStatus | "",
): string {
	if (seriesReposeStatus === "watched") return "DONE";
	if (total <= 0 || watched <= 0) return "NOT STARTED";
	if (watched >= total) return "CAUGHT UP";
	return "WATCHING";
}

function podcastEpisodeSortKey(app: App, row: EpisodeRow, file: TFile): number {
	if (row.airDate) {
		const t = new Date(row.airDate.trim()).getTime();
		if (!Number.isNaN(t)) return t;
	}
	return file.stat.mtime;
}

function comparePodcastEpisodeFilesNewestFirst(app: App, a: TFile, b: TFile): number {
	const ra = readEpisodeRow(app, a);
	const rb = readEpisodeRow(app, b);
	const ka = podcastEpisodeSortKey(app, ra, a);
	const kb = podcastEpisodeSortKey(app, rb, b);
	if (kb !== ka) return kb - ka;
	return b.path.localeCompare(a.path);
}

/** Newest first (by `airDate` / `releaseDate`, then file mtime). */
export function sortPodcastEpisodeFilesNewestFirst(app: App, files: TFile[]): TFile[] {
	return [...files].sort((a, b) => comparePodcastEpisodeFilesNewestFirst(app, a, b));
}

/** Same order as the serial detail episode list (for prev/next navigation). */
export function orderedEpisodePaths(app: App, hostFile: TFile, settings: ReposeSettings): string[] {
	const files = collectEpisodeNoteFiles(app, hostFile, settings);
	if (resolveMediaTypeForFile(app, hostFile, settings) === "podcast") {
		return sortPodcastEpisodeFilesNewestFirst(app, files).map((f) => f.path);
	}
	return files.map((f) => f.path);
}

export function tmdbIdFromFrontmatter(fm: Record<string, unknown>): number | undefined {
	const v = fm.tmdbId ?? fm.tmdb;
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string") {
		const n = parseInt(v.trim(), 10);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}
