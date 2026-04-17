import type { App, TFile } from "obsidian";
import type { ReposeSettings } from "../settings";
import { resolveMediaTypeForFile } from "./mediaDetect";

function normalizePrefix(p: string): string {
	const s = (p || "").trim().replace(/^\/+|\/+$/g, "");
	return s ? `${s}/` : "";
}

function isUnder(path: string, prefix: string): boolean {
	return prefix ? path.startsWith(prefix) : true;
}

/**
 * Scan vault markdown files under the configured media root (top-level library items only).
 */
export function collectMediaMarkdownFiles(app: App, settings: ReposeSettings): TFile[] {
	const rootPrefix = normalizePrefix(settings.mediaRoot);
	const out: TFile[] = [];
	for (const f of app.vault.getMarkdownFiles()) {
		if (!isUnder(f.path, rootPrefix)) continue;
		const mt = resolveMediaTypeForFile(app, f, settings);
		if (mt === "episode") continue;
		out.push(f);
	}
	return out;
}
