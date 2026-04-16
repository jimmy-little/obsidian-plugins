import { normalizePath, type TFile } from "obsidian";

/** Folder name + note basename (without .md) for a media entry. */
export function slugMediaFolderName(title: string): string {
	const base = title
		.trim()
		.replace(/[<>:"/\\|?*]/g, "")
		.replace(/\s+/g, " ")
		.slice(0, 80);
	return base || "Untitled";
}

export const REPOSE_IMAGES_DIR = "images" as const;

export type ImageSlot = "poster" | "banner" | "logo" | "thumb";

export const IMAGE_SLOTS: ImageSlot[] = ["poster", "banner", "logo", "thumb"];

/** Vault path to the entry folder containing the note and `images/`. */
export function getMediaEntryFolderPath(file: TFile): string | null {
	const p = file.parent?.path;
	return p && p.length > 0 ? p : null;
}

export function getImagesDirForEntry(entryFolderPath: string): string {
	return normalizePath(`${entryFolderPath}/${REPOSE_IMAGES_DIR}`);
}

/** `parent/Slug/Slug.md` when parent set; otherwise `Slug/Slug.md` */
export function buildMediaNotePath(parent: string, slug: string): string {
	const note = `${slug}.md`;
	return parent ? normalizePath(`${parent}/${slug}/${note}`) : normalizePath(`${slug}/${note}`);
}

export function buildMediaFolderPath(parent: string, slug: string): string {
	return parent ? normalizePath(`${parent}/${slug}`) : slug;
}
