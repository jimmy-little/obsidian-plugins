export type CalendarDropSlot = {
	dateIso: string;
	/** 0–23 when dropping on a time row; null = all-day / date-only */
	hour: number | null;
};

export function slotStartMinutes(slot: CalendarDropSlot): number | null {
	if (slot.hour == null) return null;
	return slot.hour * 60;
}

export function parseDropSlotFromElement(el: HTMLElement | null): CalendarDropSlot | null {
	if (!el) return null;
	const zone = el.closest("[data-drop-target]") as HTMLElement | null;
	if (!zone) return null;
	const dateIso = zone.getAttribute("data-date");
	if (!dateIso) return null;
	const hourAttr = zone.getAttribute("data-hour");
	if (hourAttr == null) return {dateIso, hour: null};
	const hour = Number.parseInt(hourAttr, 10);
	return {dateIso, hour: Number.isFinite(hour) ? hour : null};
}
