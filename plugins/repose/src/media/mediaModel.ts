import type { App, TFile } from "obsidian";

export type ReposeMediaType = "show" | "movie" | "episode" | "book" | "game" | "podcast" | "unknown";

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

export function mediaTypeFromFrontmatter(fm: Record<string, unknown>): ReposeMediaType {
	// Legacy/current Repose imports write `type: "TV Show"|"Movie"|"Episode"`
	const t = normalizeType(fm.mediaType) || normalizeType(fm.type);
	if (t === "tv show" || t === "show" || t === "series") return "show";
	if (t === "movie") return "movie";
	if (t === "episode") return "episode";
	if (t === "book") return "book";
	if (t === "game" || t === "video game") return "game";
	if (t === "podcast") return "podcast";
	return "unknown";
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

export function titleFromFrontmatterOrFile(fm: Record<string, unknown>, file: TFile): string {
	const t = fm.title;
	if (typeof t === "string" && t.trim()) return t.trim();
	return file.basename;
}

export function readMediaItem(app: App, file: TFile): MediaItem {
	const cache = app.metadataCache.getFileCache(file);
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	return {
		path: file.path,
		title: titleFromFrontmatterOrFile(fm, file),
		mediaType: mediaTypeFromFrontmatter(fm),
		status: statusFromFrontmatter(fm),
		watchedDate: watchedDateFromFrontmatter(fm),
	};
}

