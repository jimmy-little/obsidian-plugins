import { Platform } from "obsidian";

/** Obsidian mobile (iOS / Android) — limited memory and no split-pane workspace. */
export function reposeMobile(): boolean {
	return Platform.isMobile;
}

/** True when a vault path is under the configured media root. */
export function pathUnderMediaRoot(filePath: string, mediaRoot: string): boolean {
	const root = (mediaRoot || "").trim().replace(/^\/+|\/+$/g, "");
	if (!root) return true;
	return filePath === root || filePath.startsWith(`${root}/`);
}
