import type {IndexedMeeting} from "../types";

/**
 * Minutes credited for a meeting everywhere in Fulcrum: positive `totalMinutesTracked`
 * (from configured FM field) wins; otherwise falls back to scheduled `duration` (minutes).
 */
export function meetingEffectiveMinutes(
	m: Pick<IndexedMeeting, "duration" | "totalMinutesTracked">,
): number {
	const dur =
		m.duration != null && Number.isFinite(m.duration) && m.duration > 0 ? m.duration : 0;
	const tr = m.totalMinutesTracked;
	const hasPositiveTrack = tr != null && Number.isFinite(tr) && tr > 0;
	return hasPositiveTrack ? tr : dur;
}

/** True when FM has an explicit positive logged total (atomic double-count guard in rollups). */
export function meetingHasPositiveTrackedMinutes(
	m: Pick<IndexedMeeting, "totalMinutesTracked">,
): boolean {
	const tr = m.totalMinutesTracked;
	return tr != null && Number.isFinite(tr) && tr > 0;
}
