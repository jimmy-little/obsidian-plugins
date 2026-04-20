import type { App, TFile } from "obsidian";
import type { ReposeSettings } from "../settings";
import { mediaTypeFromFrontmatter, resolveMediaTypeForFile } from "./mediaDetect";
import type { ReposeMediaType } from "./mediaKinds";

export type { ReposeMediaType } from "./mediaKinds";
export { mediaTypeFromFrontmatter };

export type ReposeStatus = "watching" | "reading" | "backlog" | "watched" | "";

export type MediaItem = {
	path: string;
	title: string;
	mediaType: ReposeMediaType;
	status: ReposeStatus;
	watchedDate?: string;
};

function normalizeType(raw: unknown): string {
	return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function statusFromFrontmatter(fm: Record<string, unknown>): ReposeStatus {
	const s = normalizeType(fm.reposeStatus) || normalizeType(fm.status);
	if (s === "watching") return "watching";
	if (s === "reading") return "reading";
	if (s === "backlog" || s === "recommended" || s === "to see") return "backlog";
	if (s === "watched") return "watched";
	return "";
}

/** Trakt play timestamps (ISO 8601), oldest → newest when synced from Repose. */
export function watchedDatesIsoFromFrontmatter(fm: Record<string, unknown>): string[] {
	const w = fm.watchedDates;
	if (!Array.isArray(w)) return [];
	const out: string[] = [];
	for (const x of w) {
		if (typeof x === "string" && x.trim()) out.push(x.trim());
	}
	return out.sort();
}

/** True if the note is treated as watched (single date and/or play list). */
export function isEffectivelyWatchedFromFrontmatter(fm: Record<string, unknown>): boolean {
	if (typeof fm.watchedDate === "string" && fm.watchedDate.trim()) return true;
	return watchedDatesIsoFromFrontmatter(fm).length > 0;
}

export function watchedDateFromFrontmatter(fm: Record<string, unknown>): string | undefined {
	const dates = watchedDatesIsoFromFrontmatter(fm);
	if (dates.length > 0) {
		const last = dates[dates.length - 1]!;
		if (/^\d{4}-\d{2}-\d{2}$/.test(last)) return last;
		const t = new Date(last).getTime();
		if (!Number.isNaN(t)) return new Date(last).toISOString().split("T")[0];
		const day = last.split("T")[0];
		return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
	}
	const v = fm.watchedDate ?? fm.watched_at ?? fm.watchedAt;
	return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Milliseconds for sorting / calendar (release or first air). */
export function releaseTimeFromFrontmatter(fm: Record<string, unknown>): number | null {
	const raw = fm.releaseDate ?? fm.airDate;
	if (typeof raw !== "string" || !raw.trim()) return null;
	const t = new Date(raw.trim()).getTime();
	return Number.isNaN(t) ? null : t;
}

function parseCalendarDateStringToMs(raw: string): number | null {
	const s = raw.trim();
	if (!s) return null;
	const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T12:00:00") : new Date(s);
	const t = d.getTime();
	return Number.isNaN(t) ? null : t;
}

/**
 * Episode note: air / release time for sorting (matches episode hero field priority).
 */
export function episodeAirTimeMsFromFrontmatter(fm: Record<string, unknown>): number | null {
	const raw =
		(typeof fm.episode_publish_date === "string" && fm.episode_publish_date.trim()
			? fm.episode_publish_date.trim()
			: undefined) ??
		(typeof fm.airDate === "string" && fm.airDate.trim() ? fm.airDate.trim() : undefined) ??
		(typeof fm.releaseDate === "string" && fm.releaseDate.trim() ? fm.releaseDate.trim() : undefined) ??
		(typeof fm.date === "string" && fm.date.trim() ? fm.date.trim() : undefined);
	if (typeof raw !== "string" || !raw.trim()) return null;
	return parseCalendarDateStringToMs(raw.trim());
}

/** Milliseconds for "recently finished" ordering (newest first). */
export function watchedTimeFromFrontmatter(fm: Record<string, unknown>): number | null {
	const dates = watchedDatesIsoFromFrontmatter(fm);
	if (dates.length > 0) {
		const last = dates[dates.length - 1]!;
		const t = new Date(last).getTime();
		if (!Number.isNaN(t)) return t;
	}
	const raw = watchedDateFromFrontmatter(fm);
	if (!raw) return null;
	const t = new Date(raw).getTime();
	return Number.isNaN(t) ? null : t;
}

/** Calendar-only label for play / watch timestamps (no time in UI). */
export function formatWatchCalendarLabel(raw: string): string {
	const s = raw.trim();
	if (!s) return "";
	const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T12:00:00") : new Date(s);
	if (Number.isNaN(d.getTime())) return s;
	return d.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/** Newest-first labels for `watchedDates` / `watchedDate`. */
export function watchedPlayDatesNewestFirstLabels(fm: Record<string, unknown>): string[] {
	const isos = watchedDatesIsoFromFrontmatter(fm);
	const out: string[] = [];
	if (isos.length > 0) {
		for (let i = isos.length - 1; i >= 0; i--) {
			out.push(formatWatchCalendarLabel(isos[i]!));
		}
		return out;
	}
	const wd = watchedDateFromFrontmatter(fm);
	if (wd) return [formatWatchCalendarLabel(wd)];
	return [];
}

/** Episode list cards: at most `limit` plays, newest first. */
export function watchedPlayDatesCardPreview(
	fm: Record<string, unknown>,
	limit: number,
): string[] {
	return watchedPlayDatesNewestFirstLabels(fm).slice(0, limit);
}

/** Hero detail: comma-separated watch dates, newest first. */
export function watchedPlayDatesCommaDetail(fm: Record<string, unknown>): string {
	return watchedPlayDatesNewestFirstLabels(fm).join(", ");
}

function parseYamlDateToTime(raw: string): number {
	const s = raw.trim();
	if (!s) return NaN;
	const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T12:00:00") : new Date(s);
	return d.getTime();
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

/**
 * Book-style fields: one ISO/YMD string or YAML array; comma detail, newest first.
 * Keys e.g. `lastHighlighted`, `completedRead`.
 */
export function readingDatesCommaDetail(fm: Record<string, unknown>, key: string): string {
	const raw = yamlStringOrStringList(fm[key]);
	if (raw.length === 0) return "";
	const scored = raw.map((r) => ({ r, t: parseYamlDateToTime(r) }));
	scored.sort((a, b) => {
		const at = Number.isNaN(a.t) ? -Infinity : a.t;
		const bt = Number.isNaN(b.t) ? -Infinity : b.t;
		return bt - at;
	});
	return scored.map(({ r }) => formatWatchCalendarLabel(r)).join(", ");
}

function stripWikiLinksForDisplay(s: string): string {
	return s.replace(/\[\[([^\]]+)]]/g, (_, inner: string) => inner.trim());
}

/**
 * Book notes (Readwise, etc.): `author` / `authors` as string or YAML list, possibly wikilinks.
 */
/** Open Library work page: `url` from importer, or built from `openLibraryWorkKey` for older notes. */
export function openLibraryCatalogUrlFromFrontmatter(fm: Record<string, unknown>): string | null {
	const raw = fm.url;
	if (typeof raw === "string" && raw.trim()) {
		const t = raw.trim();
		if (/^https?:\/\//i.test(t)) return t;
	}
	const wk = fm.openLibraryWorkKey;
	if (typeof wk === "string" && wk.trim()) {
		return `https://openlibrary.org/works/${wk.trim()}`;
	}
	return null;
}

export function bookAuthorsLineFromFrontmatter(fm: Record<string, unknown>): string | null {
	const raw = fm.author ?? fm.authors;
	const parts: string[] = [];
	if (typeof raw === "string" && raw.trim()) {
		parts.push(stripWikiLinksForDisplay(raw.trim()));
	} else if (Array.isArray(raw)) {
		for (const x of raw) {
			if (typeof x === "string" && x.trim()) parts.push(stripWikiLinksForDisplay(x.trim()));
		}
	}
	if (parts.length === 0) return null;
	return parts.join(", ");
}

/** Year for display e.g. "Title (2024)" — explicit `year` / release / air date. */
export function displayYearFromFrontmatter(fm: Record<string, unknown>): number | null {
	const raw = fm.year ?? fm.releaseYear ?? fm.publishedYear;
	if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1800 && raw <= 2200) return raw;
	if (typeof raw === "string" && /^\s*\d{4}\s*$/.test(raw)) {
		const y = Number.parseInt(raw.trim(), 10);
		if (y >= 1800 && y <= 2200) return y;
	}
	const t = releaseTimeFromFrontmatter(fm);
	if (t != null) {
		const y = new Date(t).getFullYear();
		if (y >= 1800 && y <= 2200) return y;
	}
	return null;
}

/** Trakt overview / synopsis stored as `description` (optional `summary`). */
export function descriptionFromFrontmatter(fm: Record<string, unknown>): string | null {
	let v: unknown = fm.description ?? fm.summary;
	if (v && typeof v === "object" && "value" in v && typeof (v as { value?: unknown }).value === "string") {
		v = (v as { value: string }).value;
	}
	if (typeof v !== "string" || !v.trim()) return null;
	return v.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/** Genres from YAML array or comma/semicolon-separated string. */
/**
 * Human-readable release / air date for hero (uses `releaseDate` or `airDate`).
 */
export function releaseLabelFromFrontmatter(
	fm: Record<string, unknown>,
	kind: "show" | "podcast" | "movie" | "game" | "book",
): string | null {
	const raw = fm.releaseDate ?? fm.airDate;
	if (typeof raw !== "string" || !raw.trim()) return null;
	const formatted = formatWatchCalendarLabel(raw.trim());
	if (!formatted) return null;
	if (kind === "show" || kind === "podcast") {
		return `First aired ${formatted}`;
	}
	if (kind === "book") {
		return `Published ${formatted}`;
	}
	return `Released ${formatted}`;
}

/**
 * Episode or chapter date in the hero.
 * Prefers air/release fields over generic `date` (often note creation / import).
 * Uses calendar-safe formatting for `YYYY-MM-DD` so local TZ does not shift the day.
 */
export function episodeHeroLabelFromFrontmatter(
	fm: Record<string, unknown>,
	hostMediaType: ReposeMediaType | null,
): string | null {
	const raw =
		(typeof fm.episode_publish_date === "string" && fm.episode_publish_date.trim()
			? fm.episode_publish_date.trim()
			: undefined) ??
		(typeof fm.airDate === "string" && fm.airDate.trim() ? fm.airDate.trim() : undefined) ??
		(typeof fm.releaseDate === "string" && fm.releaseDate.trim() ? fm.releaseDate.trim() : undefined) ??
		(typeof fm.date === "string" && fm.date.trim() ? fm.date.trim() : undefined);
	if (typeof raw !== "string" || !raw.trim()) return null;
	const formatted = formatWatchCalendarLabel(raw.trim());
	if (!formatted) return null;
	if (hostMediaType === "book") return `Published ${formatted}`;
	if (hostMediaType === "podcast") return `Released ${formatted}`;
	return `Aired ${formatted}`;
}

/** Trakt series status on the show note (`showStatus` from import), e.g. ENDED, RETURNING SERIES. */
export function traktShowStatusBadgeFromFrontmatter(fm: Record<string, unknown>): string | null {
	const raw = fm.showStatus;
	if (typeof raw !== "string" || !raw.trim()) return null;
	return raw
		.trim()
		.replace(/_/g, " ")
		.replace(/\s+/g, " ")
		.toUpperCase();
}

export function genresFromFrontmatter(fm: Record<string, unknown>): string[] {
	const g = fm.genres;
	if (Array.isArray(g)) {
		return g.map((x) => String(x).trim()).filter(Boolean);
	}
	if (typeof g === "string" && g.trim()) {
		return g
			.split(/[,;]/)
			.map((s) => s.trim())
			.filter(Boolean);
	}
	return [];
}

export function titleFromFrontmatterOrFile(fm: Record<string, unknown>, file: TFile): string {
	const t = fm.title;
	if (typeof t === "string" && t.trim()) return t.trim();
	return file.basename;
}

export function readMediaItem(app: App, file: TFile, settings: ReposeSettings): MediaItem {
	const cache = app.metadataCache.getFileCache(file);
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	return {
		path: file.path,
		title: titleFromFrontmatterOrFile(fm, file),
		mediaType: resolveMediaTypeForFile(app, file, settings),
		status: statusFromFrontmatter(fm),
		watchedDate: watchedDateFromFrontmatter(fm),
	};
}

