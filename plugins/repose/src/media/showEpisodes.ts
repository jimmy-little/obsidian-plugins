import { type App, TFile } from "obsidian";
import type { ReposeSettings } from "../settings";
import { resolveMediaTypeForFile } from "./mediaDetect";
import {
	titleFromFrontmatterOrFile,
	watchedDateFromFrontmatter,
} from "./mediaModel";

export type EpisodeRow = {
	path: string;
	title: string;
	description: string;
	airDate: string;
	watchedDate?: string;
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
	const podcastLayout = resolveMediaTypeForFile(app, showFile, settings) === "podcast";
	const out: TFile[] = [];
	for (const child of folder.children) {
		if (!(child instanceof TFile)) continue;
		if (child.extension !== "md") continue;
		if (child.path === showFile.path) continue;
		if (!podcastLayout && !isEpisodeLikeFile(app, child, showBase)) continue;
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

export function readEpisodeRow(app: App, file: TFile): EpisodeRow {
	const cache = app.metadataCache.getFileCache(file);
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	const title = titleFromFrontmatterOrFile(fm, file);
	let description = "";
	if (typeof fm.description === "string") description = fm.description;
	else if (typeof fm.overview === "string") description = fm.overview;

	let airDate = "";
	if (typeof fm.airDate === "string") airDate = fm.airDate.trim();
	else if (typeof fm.releaseDate === "string") airDate = fm.releaseDate.trim();

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

export function tmdbIdFromFrontmatter(fm: Record<string, unknown>): number | undefined {
	const v = fm.tmdbId ?? fm.tmdb;
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string") {
		const n = parseInt(v.trim(), 10);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}
