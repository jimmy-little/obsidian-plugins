import { normalizePath, type App, TFile, TFolder } from "obsidian";
import { sanitizeFilename } from "../vault/traktNotes";

const EXTERNAL_IMG_URL = /^https?:\/\//i;

const IMAGE_FILE_RE = /\.(png|jpe?g|webp|gif|avif)$/i;
const BOOK_FOLDER_IMAGE_STEMS = [
	"poster",
	"cover",
	"banner",
	"thumb",
	"logo",
	"book",
	"front",
] as const;

function imageFilesInFolder(folder: TFolder): TFile[] {
	return folder.children.filter((c): c is TFile => c instanceof TFile && IMAGE_FILE_RE.test(c.name));
}

function pickPreferredBookImage(files: TFile[]): TFile | null {
	if (files.length === 0) return null;
	const stem = (f: TFile) => f.basename.toLowerCase();
	for (const pref of BOOK_FOLDER_IMAGE_STEMS) {
		const hit = files.find((f) => {
			const s = stem(f);
			return s === pref || s.startsWith(`${pref}-`) || s.startsWith(`${pref}_`);
		});
		if (hit) return hit;
	}
	return [...files].sort((a, b) => a.path.localeCompare(b.path))[0] ?? null;
}

/**
 * Book bundle art lives under `{parent-of-note}/images/{sanitized-note-stem}/` (same layout as
 * `downloadTraktArtToNoteFolder`). Do not use a single shared `{parent}/images/` — flat layouts
 * like `Books/*.md` would all overwrite `images/poster.jpg`.
 */
export function resolveBookBundleLocalImageFile(app: App, noteMdPath: string): TFile | null {
	const norm = normalizePath(noteMdPath);
	const parts = norm.split("/");
	if (parts.length < 2) return null;
	const parent = parts.slice(0, -1).join("/");
	const fileName = parts[parts.length - 1] ?? "";
	const noteStem = fileName.replace(/\.md$/i, "");

	const noteKey = sanitizeFilename(noteStem) || "note";
	const perBookDir = normalizePath(`${parent}/images/${noteKey}`);
	const folder = app.vault.getAbstractFileByPath(perBookDir);
	if (folder instanceof TFolder) {
		const files = imageFilesInFolder(folder);
		const picked = pickPreferredBookImage(files);
		if (picked) return picked;
	}

	return null;
}

export type ResolveListThumbnailOptions = {
	/** Resolve `{noteFolder}/images/{note-stem}/` when frontmatter does not point at a vault file. */
	bookBundle?: boolean;
};

/**
 * Kindle / Readwise / manual notes often store `image: https://…` (not a vault path).
 * Returns the first http(s) URL among common art keys, or null if only wikilinks/paths are set.
 */
export function resolveExternalImageUrl(
	fm: Record<string, unknown>,
	keyOrder: readonly string[] = ["poster", "cover", "image", "banner"],
): string | null {
	for (const k of keyOrder) {
		const v = fm[k];
		if (typeof v !== "string") continue;
		const s = v.trim();
		if (!s || s.startsWith("[[") || s.startsWith("![")) continue;
		if (EXTERNAL_IMG_URL.test(s)) return s;
	}
	return null;
}

/** Parse `![[path]]`, `[[path]]`, or `[[path|alias]]` */
export function parseVaultImageLink(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const s = raw.trim();
	const embed = /^!\[\[([^\]]+)\]\]$/u.exec(s);
	if (embed) return embed[1].split("|")[0].trim();
	const wiki = /^\[\[(.+?)\]\]$/.exec(s);
	if (wiki) return wiki[1].split("|")[0].trim();
	return null;
}

/**
 * First available vault image from common frontmatter keys (banner / cover / poster).
 * Repose stores banner as `[[attachments/.../banner.jpg]]`.
 * Pass `sourcePath` (note path) so wikilinks resolve like in the editor.
 */
export function resolveBannerOrCoverFile(
	app: App,
	fm: Record<string, unknown>,
	sourcePath?: string,
): TFile | null {
	const keys = ["banner", "cover", "image", "poster"];
	for (const k of keys) {
		const v = fm[k];
		const pathOrLink = typeof v === "string" ? v : null;
		if (!pathOrLink) continue;
		const inner = parseVaultImageLink(pathOrLink) ?? pathOrLink.trim();
		if (!inner) continue;
		const p = normalizePath(inner.replace(/^\[\[/, "").replace(/\]\]$/, ""));
		let f = app.vault.getAbstractFileByPath(p);
		if (f instanceof TFile) return f;
		if (sourcePath) {
			const dest = app.metadataCache.getFirstLinkpathDest(p, sourcePath);
			if (dest instanceof TFile) return dest;
		}
	}
	return null;
}

/** Title / wordmark image from `logo` frontmatter (Repose: `images/logo.*`). */
export function resolveLogoFile(
	app: App,
	fm: Record<string, unknown>,
	sourcePath?: string,
): TFile | null {
	const v = fm.logo;
	const pathOrLink = typeof v === "string" ? v : null;
	if (!pathOrLink) return null;
	const inner = parseVaultImageLink(pathOrLink) ?? pathOrLink.trim();
	if (!inner) return null;
	const p = normalizePath(inner.replace(/^\[\[/, "").replace(/\]\]$/, ""));
	let f = app.vault.getAbstractFileByPath(p);
	if (f instanceof TFile) return f;
	if (sourcePath) {
		const dest = app.metadataCache.getFirstLinkpathDest(p, sourcePath);
		if (dest instanceof TFile) return dest;
	}
	return null;
}

/** Poster-first (portrait) for small sidebar thumbnails; then cover / image / banner. */
export function resolveListThumbnailFile(
	app: App,
	fm: Record<string, unknown>,
	sourcePath?: string,
	opts?: ResolveListThumbnailOptions,
): TFile | null {
	const keys = ["poster", "cover", "image", "banner"];
	for (const k of keys) {
		const v = fm[k];
		const pathOrLink = typeof v === "string" ? v : null;
		if (!pathOrLink) continue;
		if (EXTERNAL_IMG_URL.test(pathOrLink.trim())) continue;
		const inner = parseVaultImageLink(pathOrLink) ?? pathOrLink.trim();
		if (!inner) continue;
		const p = normalizePath(inner.replace(/^\[\[/, "").replace(/\]\]$/, ""));
		let f = app.vault.getAbstractFileByPath(p);
		if (f instanceof TFile) return f;
		if (sourcePath) {
			const dest = app.metadataCache.getFirstLinkpathDest(p, sourcePath);
			if (dest instanceof TFile) return dest;
		}
	}
	if (opts?.bookBundle && sourcePath) {
		const bookLocal = resolveBookBundleLocalImageFile(app, sourcePath);
		if (bookLocal) return bookLocal;
	}
	return null;
}
