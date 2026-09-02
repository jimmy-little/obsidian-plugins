import type {IndexedMeeting} from "../types";

/**
 * Minutes credited for a meeting everywhere in Fulcrum: positive `totalMinutesTracked`
 * (from configured FM field) wins; otherwise indexed `duration`, then start/end datetimes.
 */
export function meetingEffectiveMinutes(
	m: Pick<IndexedMeeting, "duration" | "totalMinutesTracked" | "date" | "endTime">,
): number {
	const tr = m.totalMinutesTracked;
	if (tr != null && Number.isFinite(tr) && tr > 0) return tr;

	const dur =
		m.duration != null && Number.isFinite(m.duration) && m.duration > 0 ? m.duration : 0;
	if (dur > 0) return dur;

	const startRaw = m.date?.trim();
	const endRaw = m.endTime?.trim();
	if (!startRaw || !endRaw) return 0;
	const startMs = Date.parse(startRaw);
	const endMs = Date.parse(endRaw);
	if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return 0;
	return Math.round((endMs - startMs) / 60000);
}

/** True when FM has an explicit positive logged total (atomic double-count guard in rollups). */
export function meetingHasPositiveTrackedMinutes(
	m: Pick<IndexedMeeting, "totalMinutesTracked">,
): boolean {
	const tr = m.totalMinutesTracked;
	return tr != null && Number.isFinite(tr) && tr > 0;
}

/** Prefer meeting end/start for horizon windows; fall back to file mtime. */
export function meetingActivityMs(
	m: Pick<IndexedMeeting, "date" | "endTime" | "duration" | "totalMinutesTracked"> & {
		file: {stat: {mtime: number}};
	},
): number {
	const endTrim = m.endTime?.trim();
	if (endTrim) {
		const t = Date.parse(endTrim);
		if (!Number.isNaN(t)) return t;
	}
	const raw = m.date?.trim() ?? "";
	if (raw) {
		const startMs = Date.parse(raw);
		if (!Number.isNaN(startMs)) {
			const eff = meetingEffectiveMinutes(m);
			if (eff > 0 && raw.length > 10) return startMs + eff * 60_000;
			return startMs;
		}
	}
	return m.file.stat.mtime;
}
