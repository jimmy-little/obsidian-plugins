import { normalizePath, TFile, type App, type CachedMetadata } from "obsidian";
import type { ReposeSettings } from "../settings";
import { RULE_MEDIA_TYPES } from "../settings";
import type { ReposeMediaType } from "./mediaKinds";

function normalizeType(raw: unknown): string {
	return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/** Reads `type` / `mediaType` from YAML only (no path/tag rules). */
export function mediaTypeFromFrontmatter(fm: Record<string, unknown>): ReposeMediaType {
	const t = normalizeType(fm.mediaType) || normalizeType(fm.type);
	if (t === "tv show" || t === "show" || t === "series") return "show";
	if (t === "movie") return "movie";
	if (t === "episode") return "episode";
	if (t === "book") return "book";
	if (t === "game" || t === "video game") return "game";
	if (t === "podcast") return "podcast";
	return "unknown";
}

const EPISODE_FILENAME = /^(\d+)x(\d+)/i;

function isEpisodeLikeSibling(app: App, file: TFile, showBasename: string): boolean {
	if (file.basename === showBasename) return false;
	const cache = app.metadataCache.getFileCache(file);
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	const t = typeof fm.type === "string" ? fm.type.trim().toLowerCase() : "";
	const mt = typeof fm.mediaType === "string" ? fm.mediaType.trim().toLowerCase() : "";
	if (t === "episode" || mt === "episode") return true;
	return EPISODE_FILENAME.test(file.basename);
}

function normRoot(p: string): string {
	return normalizePath((p || "").trim().replace(/^\/+|\/+$/g, ""));
}

/** True when `filePath` is the media root or any path inside it. */
export function pathMatchesTypeFolder(filePath: string, settings: ReposeSettings, folderSpec: string): boolean {
	const root = normRoot(settings.mediaRoot);
	const extra = normalizePath((folderSpec || "").trim());
	if (!extra) return false;
	const prefix = root ? normalizePath(`${root}/${extra}`) : extra;
	const full = normalizePath(filePath);
	return full === prefix || full.startsWith(prefix + "/");
}

function normalizeTagToken(raw: string): string {
	let s = raw.trim();
	if (s.startsWith("#")) s = s.slice(1);
	return s.toLowerCase();
}

function tagMatches(want: string, tag: string): boolean {
	const t = normalizeTagToken(tag);
	const w = normalizeTagToken(want);
	if (!w || !t) return false;
	return t === w || t.endsWith("/" + w);
}

function collectTagsFromFrontmatter(fm: Record<string, unknown>): string[] {
	const out: string[] = [];
	const tags = fm.tags;
	if (typeof tags === "string" && tags.trim()) {
		for (const p of tags.split(/[,\s]+/)) {
			if (p.trim()) out.push(p);
		}
	} else if (Array.isArray(tags)) {
		for (const t of tags) {
			if (typeof t === "string" && t.trim()) out.push(t);
		}
	}
	const single = fm.tag;
	if (typeof single === "string" && single.trim()) out.push(single);
	return out;
}

function fileMatchesTag(cache: CachedMetadata | null, fm: Record<string, unknown>, tagRule: string): boolean {
	if (!tagRule.trim()) return false;
	if (cache?.tags) {
		for (const e of cache.tags) {
			if (e && typeof e.tag === "string" && tagMatches(tagRule, e.tag)) return true;
		}
	}
	for (const t of collectTagsFromFrontmatter(fm)) {
		if (tagMatches(tagRule, t)) return true;
	}
	return false;
}

function fmMatchesKv(fm: Record<string, unknown>, rule: string): boolean {
	const idx = rule.indexOf(":");
	if (idx < 0) return false;
	const keyWant = rule.slice(0, idx).trim();
	const valWant = rule.slice(idx + 1).trim().toLowerCase();
	if (!keyWant) return false;
	let v: unknown;
	for (const [k, val] of Object.entries(fm)) {
		if (k.toLowerCase() === keyWant.toLowerCase()) {
			v = val;
			break;
		}
	}
	if (v == null) return false;
	if (typeof v === "string") return v.trim().toLowerCase() === valWant;
	if (typeof v === "number" || typeof v === "boolean") return String(v).toLowerCase() === valWant;
	return false;
}

/**
 * Applies folder / tag / frontmatter rules only (no `type` / `mediaType` header, no structural episodes).
 */
export function mediaTypeFromRules(app: App, file: TFile, settings: ReposeSettings): ReposeMediaType | "unknown" {
	const cache = app.metadataCache.getFileCache(file);
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	for (const kind of RULE_MEDIA_TYPES) {
		const rule = settings.typeRules[kind];
		if (!rule?.value?.trim()) continue;
		if (rule.mode === "folder" && pathMatchesTypeFolder(file.path, settings, rule.value)) return kind;
		if (rule.mode === "tag" && fileMatchesTag(cache ?? null, fm, rule.value)) return kind;
		if (rule.mode === "frontmatter" && fmMatchesKv(fm, rule.value)) return kind;
	}
	return "unknown";
}

function isStructuralEpisode(app: App, file: TFile, settings: ReposeSettings): boolean {
	const parent = file.parent;
	if (!parent) return false;
	const bundle = parent.name;
	const showPath = normalizePath(`${parent.path}/${bundle}.md`);
	const showFile = app.vault.getAbstractFileByPath(showPath);
	if (!(showFile instanceof TFile) || file.path === showPath) return false;

	const showMt = resolveMediaTypeForFile(app, showFile, settings);
	if (showMt === "podcast" || showMt === "book") return file.extension === "md";
	if (showMt !== "show") return false;
	return isEpisodeLikeSibling(app, file, bundle);
}

/**
 * Series / podcast / book bundle note: `FolderName/FolderName.md` for a structural episode or chapter.
 */
export function resolveSerialHostFile(app: App, file: TFile, settings: ReposeSettings): TFile | null {
	if (!isStructuralEpisode(app, file, settings)) return null;
	const parent = file.parent;
	if (!parent) return null;
	const bundle = parent.name;
	const hostPath = normalizePath(`${parent.path}/${bundle}.md`);
	if (file.path === hostPath) return null;
	const host = app.vault.getAbstractFileByPath(hostPath);
	return host instanceof TFile ? host : null;
}

/**
 * Resolves media type: explicit frontmatter first, then serial episode layout (TV / podcast folders),
 * then per-type rules (folder, tag, frontmatter key:value).
 */
export function resolveMediaTypeForFile(app: App, file: TFile, settings: ReposeSettings): ReposeMediaType {
	const cache = app.metadataCache.getFileCache(file);
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	const primary = mediaTypeFromFrontmatter(fm);
	if (primary !== "unknown") return primary;

	if (isStructuralEpisode(app, file, settings)) return "episode";

	const fromRules = mediaTypeFromRules(app, file, settings);
	if (fromRules !== "unknown") return fromRules;

	return "unknown";
}
