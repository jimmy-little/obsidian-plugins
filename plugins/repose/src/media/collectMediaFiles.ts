import type { App, TFile } from "obsidian";
import type { ReposeSettings } from "../settings";
import { mediaTypeFromFrontmatter } from "./mediaModel";

function normalizePrefix(p: string): string {
	const s = (p || "").trim().replace(/^\/+|\/+$/g, "");
	return s ? `${s}/` : "";
}

function isUnder(path: string, prefix: string): boolean {
	return prefix ? path.startsWith(prefix) : true;
}

/**
 * Initial implementation: scan vault markdown files under the configured media root.
 * (Later replaced/accelerated by the persistent index/cache.)
 */
export function collectMediaMarkdownFiles(app: App, settings: ReposeSettings): TFile[] {
	const rootPrefix = normalizePrefix(settings.mediaRoot);
	const out: TFile[] = [];
	for (const f of app.vault.getMarkdownFiles()) {
		if (!isUnder(f.path, rootPrefix)) continue;
		const cache = app.metadataCache.getFileCache(f);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		const mt = mediaTypeFromFrontmatter(fm);
		// The sidebar list is for top-level items only (not individual episode notes).
		if (mt === "episode") continue;
		// For now, include unknowns too (many existing notes may not have `type/mediaType` yet).
		// We can refine this once Repose owns the schema and index.
		out.push(f);
	}
	return out;
}

