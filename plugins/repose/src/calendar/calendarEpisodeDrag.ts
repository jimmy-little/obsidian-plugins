export const REPOSE_CALENDAR_EPISODE_MIME = "application/x-repose-calendar-episode+json";

export type ReposeCalendarEpisodeDragPayload = {
	path: string;
};

export function episodeDragPayload(path: string): string {
	return JSON.stringify({ path } satisfies ReposeCalendarEpisodeDragPayload);
}

export function parseEpisodeDragPayload(raw: string): string | null {
	if (!raw.trim()) return null;
	try {
		const o = JSON.parse(raw) as ReposeCalendarEpisodeDragPayload;
		return typeof o.path === "string" && o.path.trim() ? o.path.trim() : null;
	} catch {
		return null;
	}
}

export function isEpisodeCalendarDrag(ev: DragEvent): boolean {
	const types = ev.dataTransfer?.types;
	if (!types) return false;
	return Array.from(types).includes(REPOSE_CALENDAR_EPISODE_MIME);
}
