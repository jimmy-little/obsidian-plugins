import type {TimerSettings} from "../../timer/settings";
import {allEntriesReadKeys} from "../../timer/settings";
import type {TimeEntry} from "../../timer/types";

function parseEntryTags(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return raw.filter((t): t is string => typeof t === "string");
	}
	if (typeof raw === "string" && raw.trim()) return [raw.trim()];
	return [];
}

function parseTimeMs(raw: unknown): number | null {
	if (raw == null) return null;
	if (typeof raw === "number" && Number.isFinite(raw)) {
		return raw < 1e12 ? raw * 1000 : raw;
	}
	if (typeof raw === "string") {
		const n = Date.parse(raw);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

function parseDurationMs(raw: unknown): number {
	if (typeof raw === "number" && Number.isFinite(raw)) {
		return raw < 1e6 ? raw * 1000 : raw;
	}
	return 0;
}

function entryDedupeKey(e: TimeEntry): string {
	if (e.id) return `id:${e.id}`;
	const st = e.startTime ?? 0;
	const en = e.endTime ?? 0;
	return `t:${st}:${en}:${e.label}`;
}

/** Merge entry lists; later keys do not override earlier duplicates. */
export function dedupeEntries(entries: TimeEntry[]): TimeEntry[] {
	const seen = new Set<string>();
	const out: TimeEntry[] = [];
	for (const e of entries) {
		const k = entryDedupeKey(e);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(e);
	}
	return out;
}

function isActiveEntry(e: TimeEntry): boolean {
	return e.startTime != null && e.endTime == null;
}

/** Keep a single running entry per note (latest startTime); dedupe completed rows. */
export function normalizeTimerEntries(entries: TimeEntry[]): TimeEntry[] {
	const deduped = dedupeEntries(entries);
	const completed = deduped.filter((e) => !isActiveEntry(e));
	const actives = deduped.filter(isActiveEntry);
	if (actives.length <= 1) return deduped;
	let keep = actives[0]!;
	for (const e of actives.slice(1)) {
		if ((e.startTime ?? 0) >= (keep.startTime ?? 0)) keep = e;
	}
	return [...completed, keep];
}

function parseRawEntry(raw: unknown, index: number, filePath: string): TimeEntry | null {
	if (!raw || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	const label =
		typeof o.description === "string"
			? o.description
			: typeof o.label === "string"
				? o.label
				: "";
	const startTime = parseTimeMs(o.start ?? o.startTime);
	const endTime = parseTimeMs(o.end ?? o.endTime);
	const duration = parseDurationMs(o.duration);
	const id =
		typeof o.id === "string" && o.id.trim()
			? o.id.trim()
			: `${filePath}-${index}-${startTime ?? 0}`;
	return {
		id,
		label,
		startTime,
		endTime,
		duration: duration || (startTime && endTime ? endTime - startTime : 0),
		isPaused: false,
		tags: parseEntryTags(o.tags),
	};
}

/** Inclusive local-calendar span from timer entry start/end timestamps. */
export function timeEntryDateSpan(
	entries: TimeEntry[],
): {startIso: string; endIso: string} | null {
	if (entries.length === 0) return null;
	let minMs: number | null = null;
	let maxMs: number | null = null;
	for (const e of entries) {
		if (e.startTime != null) {
			minMs = minMs == null ? e.startTime : Math.min(minMs, e.startTime);
		}
		const endMs = e.endTime ?? e.startTime;
		if (endMs != null) {
			maxMs = maxMs == null ? endMs : Math.max(maxMs, endMs);
		}
	}
	if (minMs == null || maxMs == null) return null;
	const startIso = localDateIsoFromMs(minMs);
	const endIso = localDateIsoFromMs(maxMs);
	return startIso <= endIso
		? {startIso, endIso}
		: {startIso: endIso, endIso: startIso};
}

function localDateIsoFromMs(ms: number): string {
	const d = new Date(ms);
	const y = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${mo}-${day}`;
}

/** Read and merge timer entries from all configured frontmatter keys. */
export function readTimerEntriesFromFm(
	fm: Record<string, unknown> | undefined,
	timer: TimerSettings,
	filePath = "",
): TimeEntry[] {
	if (!fm) return [];
	const merged: TimeEntry[] = [];
	for (const key of allEntriesReadKeys(timer)) {
		const raw = fm[key];
		if (!Array.isArray(raw)) continue;
		raw.forEach((item, i) => {
			const e = parseRawEntry(item, i, filePath);
			if (e) merged.push(e);
		});
	}
	return normalizeTimerEntries(merged);
}

/** Sum completed entry duration in minutes. */
export function sumEntryMinutes(entries: TimeEntry[]): number {
	let ms = 0;
	for (const e of entries) {
		if (e.endTime != null) {
			ms += e.duration > 0 ? e.duration : Math.max(0, (e.endTime ?? 0) - (e.startTime ?? 0));
		}
	}
	return Math.round(ms / 60000);
}

/** Pick write key: legacy-only notes write back to legacy; else primary. */
export function resolveEntriesWriteKey(
	fm: Record<string, unknown> | undefined,
	timer: TimerSettings,
): string {
	if (!fm) return timer.entriesKey;
	const primary = timer.entriesKey.trim();
	if (primary && Array.isArray(fm[primary]) && fm[primary]!.length > 0) {
		return primary;
	}
	for (const legacy of timer.legacyEntriesKeys) {
		const k = legacy.trim();
		if (k && Array.isArray(fm[k]) && fm[k]!.length > 0) return k;
	}
	return primary || "timeEntries";
}
