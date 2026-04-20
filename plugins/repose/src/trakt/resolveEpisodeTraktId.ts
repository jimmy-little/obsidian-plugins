import type { App, TFile } from "obsidian";
import { resolveSerialHostFile } from "../media/mediaDetect";
import { readEpisodeRow } from "../media/showEpisodes";
import type { ReposeSettings } from "../settings";
import { getSeasonEpisodes } from "./client";
import { readTraktIdFromFrontmatter } from "./watchedSync";

/**
 * Episode notes should carry `traktId` after a full sync; if missing, resolve from the
 * bundle show note + season/episode so we can POST to /sync/history.
 */
export async function resolveEpisodeTraktIdForFile(
	app: App,
	settings: ReposeSettings,
	episodeFile: TFile,
): Promise<number | null> {
	const cache = app.metadataCache.getFileCache(episodeFile);
	const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
	const existing = readTraktIdFromFrontmatter(fm);
	if (existing != null) return existing;

	const host = resolveSerialHostFile(app, episodeFile, settings);
	if (!host) return null;
	const hostCache = app.metadataCache.getFileCache(host);
	const hostFm = (hostCache?.frontmatter ?? {}) as Record<string, unknown>;
	const showTraktId = readTraktIdFromFrontmatter(hostFm);
	if (showTraktId == null) return null;

	const row = readEpisodeRow(app, episodeFile);
	if (row.season == null || row.episode == null) return null;

	const clientId = settings.traktClientId.trim();
	if (!clientId) return null;

	try {
		const seasonList = await getSeasonEpisodes(clientId, showTraktId, row.season);
		const hit = seasonList.find((e) => e.number === row.episode);
		const raw = hit?.ids?.trakt;
		if (typeof raw === "number" && Number.isFinite(raw)) return raw;
		if (typeof raw === "string") {
			const n = parseInt(raw.trim(), 10);
			if (Number.isFinite(n)) return n;
		}
		return null;
	} catch {
		return null;
	}
}
