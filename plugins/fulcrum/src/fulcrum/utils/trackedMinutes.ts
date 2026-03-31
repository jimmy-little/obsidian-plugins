/**
 * Minutes from frontmatter (TaskNotes, meetings, atomic notes) without Dataview.
 *
 * Prefers explicit totals (`totalTimeTracked` from Lapse as `HH:MM:SS`, `totalMinutesTracked`, etc.)
 * over wall-clock `startTime`/`endTime` (which is wrong across days or multiple sessions).
 */

const SPAN_FALLBACK_MAX_MS = 48 * 3600 * 1000;

function stripOuterYamlQuotes(s: string): string {
	const t = s.trim();
	if (t.length >= 2) {
		if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).trim();
		if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).trim();
	}
	return t;
}

/** Lapse writes `totalTimeTracked: "00:20:00"` (quoted HH:MM:SS). */
function parseHhMmSsToMinutes(raw: string): number | null {
	const t = stripOuterYamlQuotes(raw);
	const m3 = t.match(/^(\d+):(\d{2}):(\d{2})$/);
	if (m3) {
		const h = parseInt(m3[1]!, 10);
		const min = parseInt(m3[2]!, 10);
		const sec = parseInt(m3[3]!, 10);
		if (min >= 60 || sec >= 60 || !Number.isFinite(h + min + sec)) return null;
		return Math.max(0, Math.round(h * 60 + min + sec / 60));
	}
	/** Optional: `MM:SS` (minutes + seconds), e.g. `05:30` → 5.5 min */
	const m2 = t.match(/^(\d+):(\d{2})$/);
	if (m2) {
		const a = parseInt(m2[1]!, 10);
		const b = parseInt(m2[2]!, 10);
		if (b >= 60 || !Number.isFinite(a + b)) return null;
		return Math.max(0, Math.round(a + b / 60));
	}
	return null;
}

function coerceTrackedMinutesValue(v: unknown): number | null {
	if (v == null) return null;
	if (typeof v === "string") {
		const fromDur = parseHhMmSsToMinutes(v);
		if (fromDur != null) return fromDur;
		const str = v.trim();
		if (/^-?\d+(\.\d+)?$/.test(str)) {
			const n = Number.parseFloat(str);
			return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
		}
		return null;
	}
	if (typeof v === "number" && Number.isFinite(v)) {
		/** Values this large are almost always Lapse-style milliseconds, not minutes. */
		if (v >= 100_000) {
			return Math.max(0, Math.round(v / 60000));
		}
		return Math.max(0, Math.round(v));
	}
	return null;
}

function uniqueKeys(keys: (string | undefined)[]): string[] {
	const out: string[] = [];
	for (const k of keys) {
		const t = k?.trim();
		if (!t || out.includes(t)) continue;
		out.push(t);
	}
	return out;
}

/** Minutes from wall-clock start/end when no explicit total exists; capped to avoid multi-day garbage. */
function minutesFromStartEndFallback(fm: Record<string, unknown>): number {
	const st = fm.startTime;
	const en = fm.endTime;
	if (typeof st !== "string" || typeof en !== "string") return 0;
	const a = Date.parse(st);
	const b = Date.parse(en);
	if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
	const ms = b - a;
	if (ms > SPAN_FALLBACK_MAX_MS) return 0;
	return Math.round(ms / 60000);
}

/** Minutes from frontmatter (TaskNotes, meetings, atomic notes) without Dataview. */
export function readTrackedMinutesFromFm(
	fm: Record<string, unknown> | undefined,
	preferredKey?: string,
): number {
	if (!fm) return 0;

	const keys = uniqueKeys([
		preferredKey,
		"totalTimeTracked",
		"total_time_tracked",
		"totalMinutesTracked",
		"Total Minutes Tracked",
		"timeLoggedMinutes",
	]);

	for (const key of keys) {
		const m = coerceTrackedMinutesValue(fm[key]);
		if (m !== null) return m;
	}

	return minutesFromStartEndFallback(fm);
}
