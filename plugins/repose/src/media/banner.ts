import { normalizePath, type App, TFile } from "obsidian";

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
): TFile | null {
	const keys = ["poster", "cover", "image", "banner"];
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
