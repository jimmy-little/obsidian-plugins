import type { App, TFile } from "obsidian";
import type { ReposeSettings } from "../settings";
import { mediaTypeFromFrontmatter, resolveMediaTypeForFile } from "./mediaDetect";
import type { ReposeMediaType } from "./mediaKinds";

export type { ReposeMediaType } from "./mediaKinds";
export { mediaTypeFromFrontmatter };

export type ReposeStatus = "watching" | "backlog" | "watched" | "";

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
	if (s === "backlog" || s === "recommended" || s === "to see") return "backlog";
	if (s === "watched") return "watched";
	return "";
}

export function watchedDateFromFrontmatter(fm: Record<string, unknown>): string | undefined {
	const v = fm.watchedDate ?? fm.watched_at ?? fm.watchedAt;
	return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Trakt overview / synopsis stored as `description` (optional `summary`). */
export function descriptionFromFrontmatter(fm: Record<string, unknown>): string | null {
	const v = fm.description ?? fm.summary;
	if (typeof v !== "string" || !v.trim()) return null;
	return v.trim();
}

/** Genres from YAML array or comma/semicolon-separated string. */
/**
 * Human-readable release / air date for hero (uses `releaseDate` or `airDate`).
 */
export function releaseLabelFromFrontmatter(
	fm: Record<string, unknown>,
	kind: "show" | "podcast" | "movie" | "game",
): string | null {
	const raw = fm.releaseDate ?? fm.airDate;
	if (typeof raw !== "string" || !raw.trim()) return null;
	const d = new Date(raw.trim());
	if (Number.isNaN(d.getTime())) return null;
	const formatted = d.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
	if (kind === "show" || kind === "podcast") {
		return `First aired ${formatted}`;
	}
	return `Released ${formatted}`;
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

