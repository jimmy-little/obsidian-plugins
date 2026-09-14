export const TODAY_AGENDA_MIN_PX = 160;
export const TODAY_TASKS_MIN_PX = 160;
export const TODAY_SPLIT_PX = 5;

/** Clamp the Today view agenda column so both panes stay usable. */
export function clampTodayAgendaWidth(width: number, containerWidth: number): number {
	const max = Math.max(
		TODAY_AGENDA_MIN_PX,
		containerWidth - TODAY_SPLIT_PX - TODAY_TASKS_MIN_PX,
	);
	if (!Number.isFinite(width)) return Math.min(TODAY_AGENDA_MIN_PX, max);
	return Math.min(Math.max(Math.round(width), TODAY_AGENDA_MIN_PX), max);
}
