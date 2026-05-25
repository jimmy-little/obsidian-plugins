import { Notice, TFile, type App } from "obsidian";
import type ReposePlugin from "../main";
import {
	isEffectivelyWatchedFromFrontmatter,
	watchedDatesIsoFromFrontmatter,
} from "../media/mediaModel";
import { resolveMediaTypeForFile } from "../media/mediaDetect";
import { collectEpisodeNoteFiles, episodeDisplayTitle, readEpisodeRow } from "../media/showEpisodes";
import { resolveEpisodeTraktIdForFile } from "../trakt/resolveEpisodeTraktId";
import {
	ensureTraktAccessToken,
	pushEpisodeWatchedToTrakt,
	removeEpisodeWatchedFromTrakt,
	readTraktIdFromFrontmatter,
} from "../trakt/watchedSync";

export type EpisodeWatchMode = "airdate" | "now";

function calendarDateFromRaw(raw: string): string | null {
	const day = raw.trim().split("T")[0]?.trim();
	return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Calendar `YYYY-MM-DD` for an episode's air / release date. */
export function episodeAirDateCalendar(fm: Record<string, unknown>): string | null {
	const keys = ["episode_publish_date", "airDate", "releaseDate", "date"] as const;
	for (const k of keys) {
		const v = fm[k];
		if (typeof v === "string" && v.trim()) {
			const cal = calendarDateFromRaw(v);
			if (cal) return cal;
		}
	}
	return null;
}

export function formatDatetimeLocal(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatTimeHhMmSs(ms: number): string {
	const totalSec = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function todayCalendar(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isoForCalendarDay(cal: string): string {
	return new Date(`${cal}T12:00:00`).toISOString();
}

function episodeRuntimeMinutes(fm: Record<string, unknown>): number {
	const r = fm.runtime;
	if (typeof r === "number" && Number.isFinite(r) && r > 0) return Math.round(r);
	if (typeof r === "string") {
		const n = parseInt(r.trim(), 10);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return 30;
}

function applyWatchedFields(fm: Record<string, unknown>, calendarDate: string, isoPlay: string): void {
	const existing = watchedDatesIsoFromFrontmatter(fm);
	fm.watchedDates = existing.includes(isoPlay) ? existing : [...existing, isoPlay];
	fm.watchedDate = calendarDate;
	fm.reposeStatus = "watched";
}

function clearWatchedFields(fm: Record<string, unknown>): void {
	delete fm.watchedDate;
	delete fm.watchedDates;
	if (fm.reposeStatus === "watched") fm.reposeStatus = "watching";
}

type FulcrumTimerEntry = {
	label: string;
	start: string;
	end: string;
	duration: number;
};

function mergeFulcrumTimerFrontmatter(
	fm: Record<string, unknown>,
	entry: FulcrumTimerEntry,
): void {
	const prev = Array.isArray(fm.fulcrumTimerEntries) ? [...fm.fulcrumTimerEntries] : [];
	prev.push({
		label: entry.label,
		start: entry.start,
		end: entry.end,
		duration: entry.duration,
	});
	fm.fulcrumTimerEntries = prev;

	const starts = prev
		.map((e) => (typeof e === "object" && e && "start" in e ? String((e as { start: unknown }).start) : ""))
		.filter(Boolean);
	const ends = prev
		.map((e) => (typeof e === "object" && e && "end" in e ? String((e as { end: unknown }).end) : ""))
		.filter(Boolean);
	if (starts.length > 0) {
		fm.startTime = starts.sort()[0];
	}
	if (ends.length > 0) {
		fm.endTime = ends.sort().at(-1);
	}

	const totalSec = prev.reduce((sum, e) => {
		if (typeof e !== "object" || !e) return sum;
		const d = (e as { duration?: unknown }).duration;
		return sum + (typeof d === "number" && Number.isFinite(d) ? d : 0);
	}, 0);
	fm.totalTimeTracked = formatTimeHhMmSs(totalSec * 1000);
}

async function ensureFulcrumTimerBlock(app: App, file: TFile): Promise<void> {
	const content = await app.vault.read(file);
	if (/```[\t ]*fulcrum-timer\b/im.test(content)) return;
	const trimmed = content.trimEnd();
	const next = `${trimmed}${trimmed ? "\n\n" : ""}\`\`\`fulcrum-timer\n\`\`\`\n`;
	await app.vault.modify(file, next);
}

async function syncEpisodeTrakt(
	plugin: ReposePlugin,
	file: TFile,
	wasWatched: boolean,
	nowWatched: boolean,
	calendarDate: string,
): Promise<void> {
	if (resolveMediaTypeForFile(plugin.app, file, plugin.settings) !== "episode") return;

	const cacheAfter = plugin.app.metadataCache.getFileCache(file);
	const fmAfter = (cacheAfter?.frontmatter ?? {}) as Record<string, unknown>;

	let traktId = readTraktIdFromFrontmatter(fmAfter);
	if (traktId == null) {
		const resolved = await resolveEpisodeTraktIdForFile(plugin.app, plugin.settings, file);
		if (resolved != null) {
			traktId = resolved;
			await plugin.app.fileManager.processFrontMatter(file, (fm) => {
				(fm as Record<string, unknown>).traktId = resolved;
			});
		}
	}
	if (traktId == null) return;

	const token = await ensureTraktAccessToken(plugin);
	if (!token) return;

	try {
		if (!wasWatched && nowWatched && calendarDate) {
			await pushEpisodeWatchedToTrakt(plugin, traktId, calendarDate);
		} else if (wasWatched && !nowWatched) {
			await removeEpisodeWatchedFromTrakt(plugin, traktId);
		}
	} catch (e) {
		new Notice(e instanceof Error ? e.message : "Could not update Trakt watch state.");
	}
}

export async function markEpisodeUnwatched(plugin: ReposePlugin, file: TFile): Promise<void> {
	const cacheBefore = plugin.app.metadataCache.getFileCache(file);
	const fmBefore = (cacheBefore?.frontmatter ?? {}) as Record<string, unknown>;
	const wasWatched = isEffectivelyWatchedFromFrontmatter(fmBefore);

	await plugin.app.fileManager.processFrontMatter(file, clearWatchedFields);

	if (!wasWatched) return;
	await syncEpisodeTrakt(plugin, file, true, false, "");
}

export async function markEpisodeWatched(
	plugin: ReposePlugin,
	file: TFile,
	mode: EpisodeWatchMode,
): Promise<void> {
	const cacheBefore = plugin.app.metadataCache.getFileCache(file);
	const fmBefore = (cacheBefore?.frontmatter ?? {}) as Record<string, unknown>;
	const wasWatched = isEffectivelyWatchedFromFrontmatter(fmBefore);

	const row = readEpisodeRow(plugin.app, file);
	const label = episodeDisplayTitle(row.season, row.episode, row.title);

	let calendarDate: string;
	let isoPlay: string;
	let timerEntry: FulcrumTimerEntry | null = null;

	if (mode === "airdate") {
		const air = episodeAirDateCalendar(fmBefore);
		if (!air) {
			new Notice("No air date on this episode — use Watch Now or add an airDate in frontmatter.");
			return;
		}
		calendarDate = air;
		isoPlay = isoForCalendarDay(air);
	} else {
		const now = new Date();
		calendarDate = todayCalendar();
		isoPlay = now.toISOString();

		if (plugin.settings.trackWatchTimeWithFulcrum) {
			const durationMs = episodeRuntimeMinutes(fmBefore) * 60 * 1000;
			const end = new Date(now.getTime() + durationMs);
			const startStr = formatDatetimeLocal(now);
			const endStr = formatDatetimeLocal(end);
			timerEntry = {
				label,
				start: startStr,
				end: endStr,
				duration: Math.floor(durationMs / 1000),
			};
		}
	}

	await plugin.app.fileManager.processFrontMatter(file, (fm) => {
		applyWatchedFields(fm, calendarDate, isoPlay);
		if (timerEntry) mergeFulcrumTimerFrontmatter(fm, timerEntry);
	});

	if (timerEntry) {
		await ensureFulcrumTimerBlock(plugin.app, file);
	}

	await syncEpisodeTrakt(plugin, file, wasWatched, true, calendarDate);
}

/** Mark watched on a user-chosen calendar day (no Fulcrum timer block). */
export async function markEpisodeWatchedOnCalendarDate(
	plugin: ReposePlugin,
	file: TFile,
	calendarDate: string,
): Promise<void> {
	const cal = calendarDate.trim().split("T")[0]?.trim() ?? "";
	if (!/^\d{4}-\d{2}-\d{2}$/.test(cal)) {
		new Notice("Choose a valid date.");
		return;
	}

	const cacheBefore = plugin.app.metadataCache.getFileCache(file);
	const fmBefore = (cacheBefore?.frontmatter ?? {}) as Record<string, unknown>;
	const wasWatched = isEffectivelyWatchedFromFrontmatter(fmBefore);
	const isoPlay = isoForCalendarDay(cal);

	await plugin.app.fileManager.processFrontMatter(file, (fm) => {
		applyWatchedFields(fm, cal, isoPlay);
	});

	await syncEpisodeTrakt(plugin, file, wasWatched, true, cal);
}

/** Default value for the custom watch date picker (air date, else today). */
export function defaultCustomWatchDate(fm: Record<string, unknown>): string {
	return episodeAirDateCalendar(fm) ?? todayCalendar();
}

/** Mark unwatched episodes watched using each episode's air date; already-watched notes are left unchanged. */
export async function markEpisodesWatchedOnAirDates(
	plugin: ReposePlugin,
	episodeFiles: TFile[],
): Promise<{ marked: number; skipped: number; missingAir: number }> {
	let marked = 0;
	let skipped = 0;
	let missingAir = 0;

	for (const file of episodeFiles) {
		const cache = plugin.app.metadataCache.getFileCache(file);
		const fm = (cache?.frontmatter ?? {}) as Record<string, unknown>;
		if (isEffectivelyWatchedFromFrontmatter(fm)) {
			skipped++;
			continue;
		}
		const air = episodeAirDateCalendar(fm);
		if (!air) {
			missingAir++;
			continue;
		}
		await markEpisodeWatched(plugin, file, "airdate");
		marked++;
	}

	return { marked, skipped, missingAir };
}

export async function markSeriesEpisodesWatched(plugin: ReposePlugin, showFile: TFile): Promise<void> {
	const episodes = collectEpisodeNoteFiles(plugin.app, showFile, plugin.settings);
	const { marked, missingAir } = await markEpisodesWatchedOnAirDates(plugin, episodes);

	await plugin.app.fileManager.processFrontMatter(showFile, (fm) => {
		applyWatchedFields(fm, todayCalendar(), new Date().toISOString());
	});

	const parts: string[] = [];
	if (marked > 0) parts.push(`${marked} episode${marked === 1 ? "" : "s"} marked on air dates`);
	if (missingAir > 0) parts.push(`${missingAir} skipped (no air date)`);
	new Notice(parts.length > 0 ? parts.join(" · ") : "All episodes were already watched.");
}

export async function markSeasonEpisodesWatched(
	plugin: ReposePlugin,
	showFile: TFile,
	seasonNum: number,
): Promise<void> {
	const episodes = collectEpisodeNoteFiles(plugin.app, showFile, plugin.settings).filter((f) => {
		const row = readEpisodeRow(plugin.app, f);
		return (row.season ?? -1) === seasonNum;
	});

	if (episodes.length === 0) {
		new Notice("No episodes in this season.");
		return;
	}

	const { marked, missingAir } = await markEpisodesWatchedOnAirDates(plugin, episodes);
	const parts: string[] = [];
	if (marked > 0) parts.push(`${marked} marked on air dates`);
	if (missingAir > 0) parts.push(`${missingAir} skipped (no air date)`);
	new Notice(parts.length > 0 ? parts.join(" · ") : "All episodes in this season were already watched.");
}
