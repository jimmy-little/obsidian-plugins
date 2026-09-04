import type {FulcrumSettings} from "../fulcrum/settingsDefaults";
import {fulcrumBridgeEnabled} from "../fulcrum/settingsDefaults";
import type {BridgeCalendarEvent} from "./types";
import type {CalendarEvent} from "../fulcrum/utils/calendarEvents";
import {createRemindersBridge} from "./remindersBridge";
import {padBridgeCalendarQuery, selectedBridgeCalendarIds} from "../fulcrum/tasks/forecastCalendar";
import {localDateAndStartMinutes} from "../fulcrum/utils/worldClocks";

export function bridgeCalendarEventToCalendarEvent(row: BridgeCalendarEvent): CalendarEvent {
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
	return {
		kind: "external",
		dateIso: timed.dateIso,
		startMinutes: timed.startMinutes,
		durationMinutes,
		title: row.title,
		accentCss: "var(--text-muted)",
		open: () => undefined,
		location: row.location?.trim() || undefined,
	};
}

export async function fetchBridgeCalendarEvents(
	settings: FulcrumSettings,
	fromIso: string,
	toIso: string,
): Promise<CalendarEvent[]> {
	const ids = selectedBridgeCalendarIds(settings);
	if (!fulcrumBridgeEnabled(settings) || ids.length === 0) return [];
	const bridge = await createRemindersBridge(settings);
	if (!bridge.events) return [];
	const {queryFrom, queryTo} = padBridgeCalendarQuery(fromIso, toIso);
	const rows = await bridge.events(queryFrom, queryTo, ids);
	const allowed = new Set(ids);
	return rows
		.filter((r) => allowed.has(r.calendarId))
		.map(bridgeCalendarEventToCalendarEvent)
		.filter((r) => r.dateIso >= fromIso && r.dateIso <= toIso);
}
