import { type App, TFile } from "obsidian";
import type { ReposeSettings } from "../settings";
import {
	resolveBannerOrCoverFile,
	resolveExternalImageUrl,
	resolveListThumbnailFile,
} from "../media/banner";
import { resolveMediaTypeForFile } from "../media/mediaDetect";
import type { ReposeMediaType } from "../media/mediaKinds";
import {
	titleFromFrontmatterOrFile,
	watchedDatesIsoFromFrontmatter,
} from "../media/mediaModel";
import { readEpisodeRow } from "../media/showEpisodes";

export type ConsumptionEvent = {
	/** Stable key for Svelte each blocks. */
	id: string;
	path: string;
	dateKey: string;
	sortMs: number;
	title: string;
	subtitle: string | null;
	thumbUrl: string | null;
	/** Show / series / book cover for heatmap tiles (not episode stills). */
	heatmapThumbUrl: string | null;
	/** Dedupe key for heatmap art (host show path for episodes). */
	artKey: string;
	mediaType: ReposeMediaType;
};

export type ConsumptionIndex = {
	byDate: Map<string, ConsumptionEvent[]>;
	counts: Map<string, number>;
	events: ConsumptionEvent[];
};

function normalizePrefix(p: string): string {
	const s = (p || "").trim().replace(/^\/+|\/+$/g, "");
	return s ? `${s}/` : "";
}

function isUnder(path: string, prefix: string): boolean {
	return prefix ? path.startsWith(prefix) : true;
}

function isoToLocalDateKey(raw: string): string {
	const s = raw.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
	const d = new Date(s);
	if (Number.isNaN(d.getTime())) {
		const day = s.split("T")[0] ?? s;
		return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : s;
	}
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function isoToSortMs(raw: string): number {
	const s = raw.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00`).getTime();
	const t = new Date(s).getTime();
	return Number.isNaN(t) ? new Date(`${s.split("T")[0]}T12:00:00`).getTime() : t;
}

function yamlStringOrStringList(val: unknown): string[] {
	if (typeof val === "string" && val.trim()) return [val.trim()];
	if (!Array.isArray(val)) return [];
	const out: string[] = [];
	for (const x of val) {
		if (typeof x === "string" && x.trim()) out.push(x.trim());
	}
	return out;
}

type RawPlay = { raw: string; dateKey: string; sortMs: number };

function watchPlaysFromFrontmatter(fm: Record<string, unknown>): RawPlay[] {
	const isos = watchedDatesIsoFromFrontmatter(fm);
	if (isos.length > 0) {
		return isos.map((raw) => ({
			raw,
			dateKey: isoToLocalDateKey(raw),
			sortMs: isoToSortMs(raw),
		}));
	}
	const wd = fm.watchedDate ?? fm.watched_at ?? fm.watchedAt;
	if (typeof wd === "string" && wd.trim()) {
		const raw = wd.trim();
		return [{ raw, dateKey: isoToLocalDateKey(raw), sortMs: isoToSortMs(raw) }];
	}
	return [];
}

function readingPlaysFromFrontmatter(fm: Record<string, unknown>, keys: string[]): RawPlay[] {
	const out: RawPlay[] = [];
	for (const key of keys) {
		for (const raw of yamlStringOrStringList(fm[key])) {
			out.push({
				raw,
				dateKey: isoToLocalDateKey(raw),
				sortMs: isoToSortMs(raw),
			});
		}
	}
	return out;
}

function formatSeasonEp(season: number | undefined, episode: number | undefined): string | null {
	if (season != null && episode != null) {
		return `S${String(season).padStart(2, "0")} E${String(episode).padStart(2, "0")}`;
	}
	if (season != null) return `Season ${season}`;
	if (episode != null) return `Ep ${episode}`;
	return null;
}

function resolveThumbUrl(
	app: App,
	fm: Record<string, unknown>,
	filePath: string,
	bookBundle: boolean,
): string | null {
	const poster = resolveListThumbnailFile(app, fm, filePath, { bookBundle });
	if (poster) return app.vault.getResourcePath(poster);
	const ext = resolveExternalImageUrl(fm);
	if (ext) return ext;
	const banner = resolveBannerOrCoverFile(app, fm, filePath);
	if (banner) return app.vault.getResourcePath(banner);
	return null;
}

function hostFileForEpisode(app: App, epFile: TFile, settings: ReposeSettings): TFile | null {
	const folder = epFile.parent;
	if (!folder) return null;
	for (const child of folder.children) {
		if (!(child instanceof TFile) || child.extension !== "md") continue;
		if (child.path === epFile.path) continue;
		const mt = resolveMediaTypeForFile(app, child, settings);
		if (mt === "episode") continue;
		if (mt === "show" || mt === "podcast" || mt === "book") return child;
	}
	return null;
}

function thumbForFile(
	app: App,
	file: TFile,
	settings: ReposeSettings,
	hostFile: TFile | null,
): string | null {
	const fm = (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
	const mt = resolveMediaTypeForFile(app, file, settings);
	const hostMt = hostFile ? resolveMediaTypeForFile(app, hostFile, settings) : mt;
	const bookBundle = hostMt === "book" || mt === "book";
	let url = resolveThumbUrl(app, fm, file.path, bookBundle);
	if (url) return url;
	if (hostFile) {
		const hfm = (app.metadataCache.getFileCache(hostFile)?.frontmatter ?? {}) as Record<string, unknown>;
		url = resolveThumbUrl(app, hfm, hostFile.path, bookBundle);
	}
	return url;
}

/** Poster / cover from the parent show or book — used for heatmap trend tiles. */
function showArtThumbForFile(
	app: App,
	file: TFile,
	settings: ReposeSettings,
	hostFile: TFile | null,
): string | null {
	const mt = resolveMediaTypeForFile(app, file, settings);
	if (hostFile && mt === "episode") {
		const hostMt = resolveMediaTypeForFile(app, hostFile, settings);
		const hfm = (app.metadataCache.getFileCache(hostFile)?.frontmatter ?? {}) as Record<string, unknown>;
		return resolveThumbUrl(app, hfm, hostFile.path, hostMt === "book");
	}
	const fm = (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
	return resolveThumbUrl(app, fm, file.path, mt === "book");
}

function artKeyForFile(file: TFile, hostFile: TFile | null, mt: ReposeMediaType): string {
	if (hostFile && mt === "episode") return hostFile.path;
	return file.path;
}

function eventTitleAndSubtitle(
	app: App,
	file: TFile,
	settings: ReposeSettings,
	hostFile: TFile | null,
): { title: string; subtitle: string | null } {
	const fm = (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
	const mt = resolveMediaTypeForFile(app, file, settings);

	if (mt === "episode") {
		const row = readEpisodeRow(app, file);
		const host = hostFile ?? file;
		const hfm = (app.metadataCache.getFileCache(host)?.frontmatter ?? {}) as Record<string, unknown>;
		const showTitle = titleFromFrontmatterOrFile(hfm, host);
		const se = formatSeasonEp(row.season, row.episode);
		const hostMt = resolveMediaTypeForFile(app, host, settings);
		if (hostMt === "book") {
			const chTitle = row.title.trim();
			return { title: showTitle, subtitle: chTitle || se };
		}
		return { title: showTitle, subtitle: se };
	}

	const title = titleFromFrontmatterOrFile(fm, file);
	if (mt === "movie" || mt === "game") return { title, subtitle: null };
	if (mt === "book") return { title, subtitle: null };
	if (mt === "podcast") return { title, subtitle: null };
	return { title, subtitle: null };
}

function collectPlaysForFile(
	app: App,
	file: TFile,
	settings: ReposeSettings,
): RawPlay[] {
	const fm = (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
	const mt = resolveMediaTypeForFile(app, file, settings);

	if (mt === "show") return [];

	const watch = watchPlaysFromFrontmatter(fm);
	if (watch.length > 0) return watch;

	if (mt === "book" || mt === "episode") {
		return readingPlaysFromFrontmatter(fm, ["completedRead", "lastHighlighted"]);
	}

	return [];
}

export function buildConsumptionIndex(app: App, settings: ReposeSettings): ConsumptionIndex {
	const rootPrefix = normalizePrefix(settings.mediaRoot);
	const events: ConsumptionEvent[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		if (!isUnder(file.path, rootPrefix)) continue;

		const mt = resolveMediaTypeForFile(app, file, settings);
		if (mt === "show") continue;

		const plays = collectPlaysForFile(app, file, settings);
		if (plays.length === 0) continue;

		const hostFile =
			mt === "episode" ? hostFileForEpisode(app, file, settings) : null;
		const { title, subtitle } = eventTitleAndSubtitle(app, file, settings, hostFile);
		const thumbUrl = thumbForFile(app, file, settings, hostFile);
		const heatmapThumbUrl = showArtThumbForFile(app, file, settings, hostFile);
		const artKey = artKeyForFile(file, hostFile, mt);

		for (const play of plays) {
			events.push({
				id: `${file.path}:${play.dateKey}:${play.sortMs}`,
				path: file.path,
				dateKey: play.dateKey,
				sortMs: play.sortMs,
				title,
				subtitle,
				thumbUrl,
				heatmapThumbUrl,
				artKey,
				mediaType: mt,
			});
		}
	}

	events.sort((a, b) => {
		if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
		if (a.sortMs !== b.sortMs) return a.sortMs - b.sortMs;
		return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
	});

	const byDate = new Map<string, ConsumptionEvent[]>();
	const counts = new Map<string, number>();

	for (const ev of events) {
		const list = byDate.get(ev.dateKey);
		if (list) list.push(ev);
		else byDate.set(ev.dateKey, [ev]);
		counts.set(ev.dateKey, (counts.get(ev.dateKey) ?? 0) + 1);
	}

	return { byDate, counts, events };
}

export function consumptionEventsForDate(index: ConsumptionIndex, dateKey: string): ConsumptionEvent[] {
	return index.byDate.get(dateKey) ?? [];
}

export function thumbUrlsForDate(index: ConsumptionIndex, dateKey: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const ev of consumptionEventsForDate(index, dateKey)) {
		const url = ev.heatmapThumbUrl;
		if (!url || seen.has(ev.artKey)) continue;
		seen.add(ev.artKey);
		out.push(url);
		if (out.length >= 4) break;
	}
	return out;
}
