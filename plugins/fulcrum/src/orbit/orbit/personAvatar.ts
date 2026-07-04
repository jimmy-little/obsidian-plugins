import {type App, TFile} from "obsidian";
import {normalizeVaultLinkPath} from "./bannerImage";
import {readPersonFrontmatter} from "./personModel";

/** Resolved image URL for a person note’s `avatar` / configured field (same rules as profile banner). */
export function resolvePersonAvatarSrc(
	app: App,
	file: TFile,
	avatarFrontmatterField: string,
): string | null {
	const cache = app.metadataCache.getFileCache(file);
	const fm = readPersonFrontmatter(cache);
	const rf = cache?.frontmatter as Record<string, unknown> | undefined;
	const avKey = avatarFrontmatterField.trim() || "avatar";
	const avatarRaw =
		typeof rf?.[avKey] === "string"
			? (rf[avKey] as string)
			: typeof rf?.avatar === "string"
				? rf.avatar
				: fm.avatar;
	if (!avatarRaw?.trim()) return null;
	const s = normalizeVaultLinkPath(avatarRaw);
	if (/^https?:\/\//i.test(s)) return s;
	const dest = app.metadataCache.getFirstLinkpathDest(s, file.path);
	if (dest instanceof TFile) return app.vault.getResourcePath(dest);
	const direct = app.vault.getAbstractFileByPath(s);
	if (direct && direct instanceof TFile) return app.vault.getResourcePath(direct);
	return null;
}
