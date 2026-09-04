import {addDays, getWeekStart, toISODate} from "../utils/calendarGrid";
import {todayLocalISODate} from "../utils/dates";

export type TodayWeekDay = {
	iso: string;
	dayNum: string;
	weekday: string;
	isToday: boolean;
	isFocal: boolean;
};

export function formatTodayMasthead(iso: string): {dayNum: string; monthWeekday: string} {
	const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
	if (Number.isNaN(d.getTime())) {
		return {dayNum: iso.slice(8, 10), monthWeekday: iso};
	}
	const month = d.toLocaleDateString("en-US", {month: "long"}).toUpperCase();
	const weekday = d.toLocaleDateString("en-US", {weekday: "long"}).toUpperCase();
	return {dayNum: String(d.getDate()), monthWeekday: `${month} ${weekday}`};
}

/** Seven days of the week containing `focalIso`, starting on `weekStartDay` (0=Sun). */
export function buildTodayWeekDays(
	focalIso: string,
	weekStartDay: number,
	todayIso = todayLocalISODate(),
): TodayWeekDay[] {
	const focal = new Date(`${focalIso.slice(0, 10)}T12:00:00`);
	if (Number.isNaN(focal.getTime())) return [];
	const start = getWeekStart(focal, weekStartDay);
	const out: TodayWeekDay[] = [];
	for (let i = 0; i < 7; i++) {
		const d = addDays(start, i);
		const iso = toISODate(d);
		out.push({
			iso,
			dayNum: String(d.getDate()),
			weekday: d.toLocaleDateString("en-US", {weekday: "short"}),
			isToday: iso === todayIso,
			isFocal: iso === focalIso,
		});
	}
	return out;
}

export function shiftIsoWeek(iso: string, weeks: number): string {
	const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
	d.setDate(d.getDate() + weeks * 7);
	return toISODate(d);
}
