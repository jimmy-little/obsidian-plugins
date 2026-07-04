import type {App} from "obsidian";
import {TFile} from "obsidian";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/**
 * Strip Obsidian wikilink / embed wrappers so {@link App.metadataCache.getFirstLinkpathDest} gets a real linkpath.
 * Handles values like `![[Assets/banner.png]]` (Banners plugin), `[[Note]]`, and optional `|alias`.
 */
export function normalizeVaultLinkPath(raw: string): string {
	const s = raw.trim();
	const embed = /^!\[\[([^\]]+)\]\]$/u.exec(s);
	if (embed) return embed[1].split("|")[0].trim();
	const wiki = /^\[\[([^\]]+)\]\]$/u.exec(s);
	if (wiki) return wiki[1].split("|")[0].trim();
	return s;
}

/**
 * Resolve `banner:` frontmatter (wikilink, vault path, or URL) to a URL suitable for `<img src>` / CSS background.
 */
export function resolveBannerImageUrl(
	app: App,
	raw: string | undefined,
	sourcePath: string,
): string | null {
	if (!raw?.trim()) return null;
	const s = normalizeVaultLinkPath(raw);
	if (/^https?:\/\//i.test(s)) return s;
	const dest = app.metadataCache.getFirstLinkpathDest(s, sourcePath);
	if (dest instanceof TFile && IMAGE_EXT.test(dest.path)) {
		return app.vault.getResourcePath(dest);
	}
	const direct = app.vault.getAbstractFileByPath(s);
	if (direct instanceof TFile && IMAGE_EXT.test(direct.path)) {
		return app.vault.getResourcePath(direct);
	}
	return null;
}
