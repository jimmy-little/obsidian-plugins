import type {FulcrumSettings} from "../settingsDefaults";
import type {BridgeCalendarEvent} from "../../conduit/types";
import type {ForecastCalendarRow} from "./tasksViewModel";
import {createRemindersBridge} from "../../conduit/remindersBridge";
import {parseCalendarIdList} from "../../conduit/bridgeCalendarSettings";
import {addDaysIso} from "../utils/dates";
import {localDateAndStartMinutes} from "../utils/worldClocks";

export function parseForecastCalendarIds(raw: string): string[] {
	return [...parseCalendarIdList(raw)];
}

/** Horizon agenda + Calendar overlay share selected Bridge calendars. */
export function selectedBridgeCalendarIds(settings: FulcrumSettings): string[] {
	const ids = new Set<string>([
		...parseForecastCalendarIds(settings.forecastCalendarIds),
		...parseForecastCalendarIds(settings.remindersCalendarIds),
	]);
	return [...ids];
}

/**
 * Widen a YYYY-MM-DD query so EventKit still covers local days when the bridge
 * parses date-only strings as UTC midnight (and treats `to` as exclusive).
 */
export function padBridgeCalendarQuery(
	fromIso: string,
	toIso: string,
): {queryFrom: string; queryTo: string} {
	return {
		queryFrom: addDaysIso(fromIso, -1),
		queryTo: addDaysIso(toIso, 2),
	};
}

export function bridgeEventToForecastRow(
	row: BridgeCalendarEvent,
	calendarTitle?: string,
): ForecastCalendarRow {
	const timed = row.allDay
		? {dateIso: localDateAndStartMinutes(row.startIso).dateIso, startMinutes: null}
		: localDateAndStartMinutes(row.startIso);
	let durationMinutes: number | null = null;
	if (!row.allDay && row.endIso) {
		const a = new Date(row.startIso).getTime();
		const b = new Date(row.endIso).getTime();
		if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
			durationMinutes = Math.max(15, Math.round((b - a) / 60_000));
		}
	}
	const location = row.location?.trim() || undefined;
	return {
		eventId: row.id,
		title: row.title,
		dateIso: timed.dateIso,
		startMinutes: timed.startMinutes,
		durationMinutes,
		calendarTitle,
		location,
	};
}

export async function fetchForecastCalendarRows(
	settings: FulcrumSettings,
	fromIso: string,
	toIso: string,
): Promise<ForecastCalendarRow[]> {
	const ids = selectedBridgeCalendarIds(settings);
	if (!settings.conduitEnabled || !settings.forecastShowSystemCalendars || ids.length === 0) {
		return [];
	}
	const bridge = await createRemindersBridge(settings);
	if (!bridge.events) return [];
	const titleById = new Map<string, string>();
	if (bridge.calendars) {
		try {
			const cals = await bridge.calendars();
			for (const c of cals) titleById.set(c.id, c.title);
		} catch {
			/* optional */
		}
	}
	const {queryFrom, queryTo} = padBridgeCalendarQuery(fromIso, toIso);
	const rows = await bridge.events(queryFrom, queryTo, ids);
	const allowed = new Set(ids);
	return rows
		.filter((r) => allowed.has(r.calendarId))
		.map((r) => bridgeEventToForecastRow(r, titleById.get(r.calendarId)))
		.filter((r) => r.dateIso >= fromIso && r.dateIso <= toIso);
}
